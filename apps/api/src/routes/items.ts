import { Hono } from "hono";
import { type AppVariables } from "../types.ts";
import { jwtMiddleware } from "../middleware.ts";
import { db } from "@item-locate/db";
import { items, itemsWhereAbouts, users, containers, categories } from "@item-locate/db";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { idParamSchema, postItemSchema, postItemCategorySchema, patchItemSchema, moveItemSchema } from "@item-locate/types";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";


const app = new Hono<{ Variables: AppVariables }>();

/**
 * GET /items — Doğrulanmış tenant'ın item'larını opsiyonel filtrelerle listeler. Input: JWT'den tenantId
 * ve iki opsiyonel query param — isPinned (yalnızca "true" kabul edilir; "false" 400 verir) ve categoryId
 * (uuid). isPinned=true ise sadece pinliler, categoryId verilirse sadece o kategori, ikisi birden
 * verilirse her ikisi (AND), hiçbiri verilmezse tüm item'lar gelir. Her item'ın en son whereabouts
 * kaydı tek sorguda çekilir ve getItemStatus'a verilerek status("not_set" | "missing" | "with_you" | "stored")
 * ve lastChangeDate alanları üretilir. Output (200): item dizisi, her item'da id, name, className, status, lastChangeDate.
 * Query geçersizse 400 döner.
 */
app.get("/items", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { isPinned, categoryId } = c.req.query();
  const querySchema = z.object({
    isPinned: z.literal("true").optional(),
    categoryId: z.uuid().optional(),
  });
  const parsed = querySchema.safeParse({ isPinned, categoryId });
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const conditions = [
    eq(items.tenantId, payload.tenantId),
    parsed.data.isPinned === "true" ? eq(items.isPinned, true) : undefined,
    parsed.data.categoryId ? eq(items.categoryId, parsed.data.categoryId) : undefined,
  ].filter(Boolean);

  const userItems = await db.query.items.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      name: true,
      className: true,
    },
  });

  // Her item'ın en son whereabouts kaydını tek sorguda çek (N+1'den kaçınmak için DISTINCT ON).
  const itemIds = userItems.map((i) => i.id);
  const latestWhereabouts = itemIds.length
    ? await db
        .selectDistinctOn([itemsWhereAbouts.itemId])
        .from(itemsWhereAbouts)
        .where(inArray(itemsWhereAbouts.itemId, itemIds))
        .orderBy(itemsWhereAbouts.itemId, desc(itemsWhereAbouts.createdAt))
    : [];

  const whereaboutByItem = new Map(
    latestWhereabouts.map((w) => [w.itemId, w])
  );

  const result = userItems.map((item) => ({
    id: item.id,
    name: item.name,
    className: item.className,
    ...getItemStatus(whereaboutByItem.get(item.id), payload.userId),
  }));

  return c.json(result);
});






/**
 * GET /items/:id — Mobil item detay ekranı için tek istekte gereken tüm bilgiyi döner. Input: URL
 * param id (uuid), JWT (tenant + user). Item tenant'a ait değilse 403. Output (200): item alanları
 * (embedding hariç); locationDescription (son whereabouts kaydındaki açıklama, yoksa null);
 * container ({ id, name } | null); user ({ id, name } | null); status ("not_set" | "missing" |
 * "with_you" | "stored", getItemStatus'tan); policy bayrakları (canTake, canLeave, canMove,
 * canMarkMissing, canMarkNotSet — buton enable/disable için getItemPolicy'den).
 */
app.get("/items/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  // item bu tenant'a ait mi? (embedding hariç gerekli alanlar)
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)),
    columns: {
      id: true,
      name: true,
      className: true,
      categoryId: true,
      isPinned: true,
      isHidden: true,
    },
  });
  if (!item) throw new HTTPException(403, { message: "Access denied" });

  // son iki whereabouts kaydı + container/user adları (tek leftJoin'li sorgu)
  const rows = await db
    .select({
      whereabout: itemsWhereAbouts,
      container: { id: containers.id, name: containers.name },
      user: { id: users.id, name: users.name },
    })
    .from(itemsWhereAbouts)
    .leftJoin(containers, eq(containers.id, itemsWhereAbouts.containerId))
    .leftJoin(users, eq(users.id, itemsWhereAbouts.userId))
    .where(eq(itemsWhereAbouts.itemId, itemId))
    .orderBy(desc(itemsWhereAbouts.createdAt))
    .limit(2);

  const latestRow = rows[0];
  const latest = latestRow?.whereabout;
  const previous = rows[1]?.whereabout;

  const policy = getItemPolicy(latest, previous, payload.userId);
  const { status } = getItemStatus(latest, payload.userId);

  return c.json({
    ...item,
    locationDescription: latest?.locationDescription ?? null,
    container: latestRow?.container?.id ? latestRow.container : null,
    user: latestRow?.user?.id ? latestRow.user : null,
    status,
    ...policy,
  });
});






/**
 * POST /items/categories — Doğrulanmış tenant için yeni bir kategori oluşturur. Input (JSON): names
 * (zorunlu) — dil kodu → isim eşlemesi (Record<string, string>), en az "en" (İngilizce) anahtarı bulunmak
 * zorunda ve değerler boş olamaz. tenantId JWT'den gelir, client gönderemez. Body'yi doğrular ve kategoriyi
 * ilgili tenant'a bağlı olarak ekler. Output (201): oluşturulan kategorinin id ve names alanları. Body
 * geçersizse (örn. "en" eksik veya boş değer) 400 döner.
 */
app.post("/items/categories", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const body = await c.req.json();
  const parsed = postItemCategorySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const [created] = await db
    .insert(categories)
    .values({
      names: parsed.data.names,
      tenantId: payload.tenantId,
    })
    .returning({
      id: categories.id,
      names: categories.names,
    });

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create category" });
  }

  return c.json(created, 201);
});




/**
 * GET /items/categories — Doğrulanmış tenant'a ait tüm kategorileri listeler. Input: JWT'den tenantId
 * (ekstra parametre almaz). Bu tenant'ın kategorilerini çeker. Output (200): kategori dizisi, her kategoride
 * sadece id ve names (dil kodu → isim eşlemesi) alanları.
 */
app.get("/items/categories", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const categoryList = await db.query.categories.findMany({
    where: eq(categories.tenantId, payload.tenantId),
    columns: {
      id: true,
      names: true,
    },
  });
  return c.json(categoryList);
});



/**
 * POST /items — Doğrulanmış tenant için yeni bir item oluşturur. Input: name (zorunlu), className
 * (opsiyonel, ItemClassName enum), categoryId (opsiyonel, uuid), locationDescription (opsiyonel,
 * serbest metin — /analyze/item-location'dan gelebilir), containerId (opsiyonel, uuid —
 * /analyze/item-location'ın match.containerId'sinden gelebilir). Konum bilgisi (containerId ve
 * locationDescription) itemsWhereAbouts'ta tutulduğu için ikisi birden, yalnızca biri veya hiçbiri
 * gönderilebilir. Body'yi doğrular, containerId ve categoryId verilmişse her birinin bu tenant'a ait
 * olduğunu kontrol eder ve tek transaction içinde item'ı ekler; containerId veya locationDescription'dan
 * en az biri verildiyse kind="stored" olan ilk whereabouts satırını oluşturur (ikisi de yoksa satır
 * yazılmaz, item "kayıt yok = not_set" semantiğiyle gözükür). Başarılıysa 201 ile sadece itemId ve
 * itemName döndürür; doğrulama hatasında 400, container ya da category bu tenant'a ait değilse 403 döner.
 * tx bozulmaması için setItemLocation fonksiyonu kullanılmadı.
 */
 app.post("/items", jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const body = await c.req.json();
   const parsed = postItemSchema.safeParse(body);
   if (!parsed.success) {
     return c.json({ error: parsed.error.issues }, 400);
   }

   const { containerId, locationDescription, ...itemFields } = parsed.data;

   // If a containerId is provided, make sure it belongs to this tenant.
   if (containerId) {
     const container = await db.query.containers.findFirst({
       where: and(
         eq(containers.id, containerId),
         eq(containers.tenantId, payload.tenantId)
       ),
     });
     if (!container) throw new HTTPException(403, { message: "Access denied" });
   }

   // If a categoryId is provided, make sure it belongs to this tenant.
   if (itemFields.categoryId) {
     const category = await db.query.categories.findFirst({
       where: and(
         eq(categories.id, itemFields.categoryId),
         eq(categories.tenantId, payload.tenantId)
       ),
     });
     if (!category) throw new HTTPException(403, { message: "Access denied" });
   }

   const item = await db.transaction(async (tx) => {
     const [created] = await tx
       .insert(items)
       .values({
         ...itemFields,
         tenantId: payload.tenantId,
       })
       .returning({ itemId: items.id, itemName: items.name });
     if (!created) {
       throw new HTTPException(500, { message: "Failed to create item" });
     }
     // containerId veya locationDescription verildiyse ilk whereabouts satırını oluştur (kind="stored")
     if (containerId || locationDescription) {
       await tx.insert(itemsWhereAbouts).values({
         itemId: created.itemId,
         containerId: containerId ?? null,
         userId: null,
         locationDescription: locationDescription ?? null,
         kind: "stored",
       });
     }
     return created;
   });

   return c.json(item, 201);
 });



 /**
  * PATCH /items/:id — Doğrulanmış tenant'ın bir item'ını kısmi olarak günceller. Input: URL param id
  * (uuid) ve JSON body'de name, className, isPinned, isHidden alanları (hepsi opsiyonel ama en az biri
  * gönderilmeli; isPinned/isHidden boolean). locationDescription bu uçtan güncellenmez — konum bilgisi
  * itemsWhereAbouts'a yazıldığı için POST /items/:id/whereabouts üzerinden değiştirilir. itemId'nin bu
  * tenant'a ait olduğunu kontrol eder, değilse 403 döner; ait ise yalnızca gelen alanları günceller
  * (updatedAt otomatik tazelenir). Output (200): güncellenen item'ın id, name, className, isPinned,
  * isHidden alanları. Body geçersizse veya hiç alan gelmezse 400 döner.
  */
 app.patch("/items/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const { id: itemId } = c.req.valid("param");
   const body = await c.req.json();
   const parsed = patchItemSchema.safeParse(body);
   if (!parsed.success) {
     return c.json({ error: parsed.error.issues }, 400);
   }

   // item bu tenant'a ait mi?
   const item = await db.query.items.findFirst({
     where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)),
     columns: { id: true },
   });
   if (!item) throw new HTTPException(403, { message: "Access denied" });

   const [updated] = await db
     .update(items)
     .set(parsed.data)
     .where(and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)))
     .returning({
       id: items.id,
       name: items.name,
       className: items.className,
       isPinned: items.isPinned,
       isHidden: items.isHidden,
     });

   if (!updated) {
     throw new HTTPException(500, { message: "Failed to update item" });
   }

   return c.json(updated);
 });

 /**
  * POST /items/:id/took — Mevcut kullanıcı item'ı "aldı": itemsWhereAbouts'a userId=payload.userId,
  * containerId ve locationDescription null, kind="stored" olan yeni bir satır yazar. Input: URL param
  * id (uuid), JWT (tenant + user). Akış: loadItemContext (tenant kontrolü + son iki whereabouts kaydı
  * + getItemPolicy) çağrılır; policy.canTake false ise 409; satır setItemLocation ile yazılır; yeni
  * satır ile eski latest kullanılarak güncel policy hesaplanır. Output (200): aksiyon uygulandıktan
  * sonraki duruma göre policy bayrakları (canTake, canLeave, canMove, canMarkMissing, canMarkNotSet).
  * Item bu tenant'a ait değilse 403, aksiyon mevcut state'te geçersizse 409.
  */
 app.post("/items/:id/took", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const { id: itemId } = c.req.valid("param");

   const ctx = await loadItemContext(itemId, payload);
   if (!ctx.policy.canTake) {
     throw new HTTPException(409, { message: "Action not allowed in current state" });
   }

   const newRow = await setItemLocation(itemId, null, payload.userId);

   // yeni latest = newRow, yeni previous = bir önceki latest
   const updatedPolicy = getItemPolicy(newRow, ctx.latest, payload.userId);
   return c.json(updatedPolicy);
 });


 /**
  * POST /items/:id/left — Mevcut kullanıcı taşıdığı item'ı geri koydu: kullanıcı item'ı aldığı satırdan
  * bir öncekinin konum bilgilerini (containerId ve locationDescription) kopyalayan kind="stored" yeni
  * bir satır yazar. Önceki satır container'lıysa o container'a, description-only'se aynı description'la,
  * her ikisi de varsa ikisiyle birden geri koyar. Input: URL param id (uuid), JWT (tenant + user).
  * Akış: loadItemContext çağrılır; policy.canLeave false ise 409; ctx.previous'un containerId ve
  * locationDescription alanları setItemLocation'a verilerek yeni satır oluşturulur; yeni satır ile
  * eski latest kullanılarak güncel policy hesaplanır. Output (200): aksiyon uygulandıktan sonraki
  * duruma göre policy bayrakları. Item bu tenant'a ait değilse 403, aksiyon mevcut state'te geçersizse
  * 409.
  */
 app.post("/items/:id/left", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const { id: itemId } = c.req.valid("param");

   const ctx = await loadItemContext(itemId, payload);
   if (!ctx.policy.canLeave) {
     throw new HTTPException(409, { message: "Action not allowed in current state" });
   }

   // canLeave true ise ctx.previous mutlaka tanımlıdır — defensive guard (TS narrow için de gerekli)
   const prev = ctx.previous;
   if (!prev) {
     throw new HTTPException(500, {
       message: "Inconsistent state: canLeave true but previous missing",
     });
   }

   const newRow = await setItemLocation(
     itemId,
     prev.containerId,
     null,
     prev.locationDescription
   );

   // yeni latest = newRow, yeni previous = bir önceki latest
   const updatedPolicy = getItemPolicy(newRow, ctx.latest, payload.userId);
   return c.json(updatedPolicy);
 });

 /**
  * POST /items/:id/move — Item'ı yeni bir konuma taşır: itemsWhereAbouts'a containerId ve/veya
  * locationDescription, userId null, kind="stored" olan yeni bir satır yazar. Input: URL param id
  * (uuid), JSON body'de containerId (opsiyonel, uuid) ve locationDescription (opsiyonel, serbest
  * metin) — en az biri zorunlu; JWT (tenant + user). Akış: body doğrulanır; loadItemContext çağrılır;
  * policy.canMove false ise 409; containerId verildiyse o container'ın bu tenant'a aitliği ayrıca
  * kontrol edilir; satır setItemLocation ile yazılır; yeni satır ile eski latest kullanılarak güncel
  * policy hesaplanır. Output (200): aksiyon uygulandıktan sonraki duruma göre policy bayrakları.
  * Body geçersizse 400, item ya da container bu tenant'a ait değilse 403, aksiyon mevcut state'te
  * geçersizse 409. NOT: canMove yalnızca "aktif user (with_you)" durumunda true; yani bu uç sadece
  * "elimdeki item'ı bir yere koy" semantiğine hizmet eder. Bir container'daki item'ı doğrudan başka
  * container'a aktarma akışı kasıtlı olarak desteklenmez — client önce /took ile item'ı eline alıp
  * sonra /move çağırmalıdır.
  */
 app.post("/items/:id/move", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const { id: itemId } = c.req.valid("param");
   const body = await c.req.json();
   const parsed = moveItemSchema.safeParse(body);
   if (!parsed.success) {
     return c.json({ error: parsed.error.issues }, 400);
   }
   const { containerId, locationDescription } = parsed.data;

   const ctx = await loadItemContext(itemId, payload);
   if (!ctx.policy.canMove) {
     throw new HTTPException(409, { message: "Action not allowed in current state" });
   }

   // containerId verildiyse, container bu tenant'a ait mi?
   if (containerId) {
     const container = await db.query.containers.findFirst({
       where: and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)),
       columns: { id: true },
     });
     if (!container) throw new HTTPException(403, { message: "Access denied" });
   }

   const newRow = await setItemLocation(
     itemId,
     containerId ?? null,
     null,
     locationDescription ?? null
   );

   const updatedPolicy = getItemPolicy(newRow, ctx.latest, payload.userId);
   return c.json(updatedPolicy);
 });


 /**
  * POST /items/:id/missing — Item'ı "kayıp" olarak işaretler: itemsWhereAbouts'a containerId, userId
  * ve locationDescription null, kind="missing" olan yeni bir satır yazar. Input: URL param id (uuid),
  * JWT (tenant + user). Akış: loadItemContext çağrılır; policy.canMarkMissing false ise 409; satır
  * setItemLocation ile yazılır (üç konum alanı da null, emptyKind="missing"); yeni satır ile eski
  * latest kullanılarak güncel policy hesaplanır. Output (200): aksiyon uygulandıktan sonraki duruma
  * göre policy bayrakları. Item bu tenant'a ait değilse 403, aksiyon mevcut state'te geçersizse 409.
  */
 app.post("/items/:id/missing", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const { id: itemId } = c.req.valid("param");

   const ctx = await loadItemContext(itemId, payload);
   if (!ctx.policy.canMarkMissing) {
     throw new HTTPException(409, { message: "Action not allowed in current state" });
   }

   const newRow = await setItemLocation(itemId, null, null, null, "missing");

   const updatedPolicy = getItemPolicy(newRow, ctx.latest, payload.userId);
   return c.json(updatedPolicy);
 });

 /**
  * POST /items/:id/notSet — Item'ın konum bilgisini sıfırlar: itemsWhereAbouts'a containerId, userId
  * ve locationDescription null, kind="not_set" olan yeni bir satır yazar. "Bu item için artık konum
  * belirtilmemiş" durumunu kalıcı kayıt olarak ifade eder (kayıt-yok = not_set ile semantik olarak
  * aynı ama explicit). Input: URL param id (uuid), JWT (tenant + user). Akış: loadItemContext
  * çağrılır; policy.canMarkNotSet false ise 409; satır setItemLocation ile yazılır (üç konum alanı
  * da null, emptyKind="not_set"); yeni satır ile eski latest kullanılarak güncel policy hesaplanır.
  * Output (200): aksiyon uygulandıktan sonraki duruma göre policy bayrakları. Item bu tenant'a ait
  * değilse 403, aksiyon mevcut state'te geçersizse 409.
  */
 app.post("/items/:id/notSet", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const { id: itemId } = c.req.valid("param");

   const ctx = await loadItemContext(itemId, payload);
   if (!ctx.policy.canMarkNotSet) {
     throw new HTTPException(409, { message: "Action not allowed in current state" });
   }

   const newRow = await setItemLocation(itemId, null, null, null, "not_set");

   const updatedPolicy = getItemPolicy(newRow, ctx.latest, payload.userId);
   return c.json(updatedPolicy);
 });

 /**
  * GET /items/:id/whereabouts — Item'ın son 5 "stored" konumunu ve en son bilinen konumu (lastSpotted)
  * döner. Mobilde item geçmişi listesi (kullanıcıya "şuralarda görüldü" özeti) ve "en son şu tarihte
  * burada görüldü" rozeti için tek istekte yeterli. Input: URL param id (uuid), JWT (tenant). Akış:
  * item'ın bu tenant'a aitliği doğrulanır (değilse 403); itemsWhereAbouts'tan kind="stored" satırlar
  * createdAt DESC sırayla, limit 5, containers ve users tablolarıyla leftJoin'li tek sorguda çekilir;
  * container join içinde "o container'ın şu anki item sayısı" korelasyonlu subquery ile hesaplanır;
  * en yenisi lastSpotted olarak özetlenir. Output (200): history dizisi (en fazla 5) — her satır üç
  * shape'ten birinde: { containerId, containerName, containerItemCount } | { userId, userName } |
  * { locationDescription }; zaman bilgisi history'de tutulmaz. lastSpotted: en son stored satırın
  * özeti — { createdAt, container ({id, name, itemCount} | null), user ({id, name} | null),
  * locationDescription } veya null (item hiç stored durumuna yerleşmemişse). Item bu tenant'a ait
  * değilse 403.
  */
 app.get("/items/:id/whereabouts", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
   const payload = c.get("jwtPayload");
   const { id: itemId } = c.req.valid("param");

   // item bu tenant'a ait mi?
   const item = await db.query.items.findFirst({
     where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)),
     columns: { id: true },
   });
   if (!item) throw new HTTPException(403, { message: "Access denied" });

   // son 5 kind="stored" satır + container/user isimleri + container'ın şu anki item sayısı
   const storedRows = await db
     .select({
       whereabout: itemsWhereAbouts,
       container: {
         id: containers.id,
         name: containers.name,
         itemCount: sql<number>`(
           SELECT COUNT(*) FROM items_where_abouts iwa
           WHERE iwa.container_id = ${containers.id}
           AND iwa.created_at = (
             SELECT MAX(created_at) FROM items_where_abouts
             WHERE item_id = iwa.item_id
           )
         )`.as("container_item_count"),
       },
       user: { id: users.id, name: users.name },
     })
     .from(itemsWhereAbouts)
     .leftJoin(containers, eq(containers.id, itemsWhereAbouts.containerId))
     .leftJoin(users, eq(users.id, itemsWhereAbouts.userId))
     .where(
       and(
         eq(itemsWhereAbouts.itemId, itemId),
         eq(itemsWhereAbouts.kind, "stored")
       )
     )
     .orderBy(desc(itemsWhereAbouts.createdAt))
     .limit(5);

   // history: her satır üç shape'ten birinde (zaman bilgisi yok)
   const history = storedRows.map((r) => {
     if (r.container?.id) {
       return {
         containerId: r.container.id,
         containerName: r.container.name,
         containerItemCount: Number(r.container.itemCount ?? 0),
       };
     }
     if (r.user?.id) {
       return { userId: r.user.id, userName: r.user.name };
     }
     return { locationDescription: r.whereabout.locationDescription };
   });

   // lastSpotted: storedRows'ın ilki (en yeni stored satır) — ekstra sorgu yok
   const latest = storedRows[0];
   const lastSpotted = latest
     ? {
         createdAt: latest.whereabout.createdAt,
         container: latest.container?.id
           ? {
               id: latest.container.id,
               name: latest.container.name,
               itemCount: Number(latest.container.itemCount ?? 0),
             }
           : null,
         user: latest.user?.id ? latest.user : null,
         locationDescription: latest.whereabout.locationDescription,
       }
     : null;

   return c.json({ history, lastSpotted });
 });





type WhereaboutRow = typeof itemsWhereAbouts.$inferSelect;

/**
 * getItemStatus — Bir item'ın en son itemsWhereAbouts kaydı ve mevcut userId'den anlık durumunu
 * hesaplayan saf fonksiyon. Mantık doğrudan kind enum'u üzerinden dallanır: kayıt yoksa "not_set";
 * kind="missing" ise "missing"; kind="not_set" ise "not_set"; kind="stored" + userId istekteki
 * kullanıcıya aitse "with_you"; kind="stored" + diğer (container'da veya başka kullanıcıda veya
 * sadece description ile saklı) ise "stored". lastChangeDate olarak kaydın createdAt'i (kayıt yoksa
 * null) döner.
 */
export function getItemStatus(
  whereabout: WhereaboutRow | undefined,
  userId: string
): {
  status: "not_set" | "missing" | "with_you" | "stored";
  lastChangeDate: Date | null;
} {
  if (!whereabout) return { status: "not_set", lastChangeDate: null };
  if (whereabout.kind === "missing") {
    return { status: "missing", lastChangeDate: whereabout.createdAt };
  }
  if (whereabout.kind === "not_set") {
    return { status: "not_set", lastChangeDate: whereabout.createdAt };
  }
  // kind === "stored"
  if (whereabout.userId === userId) {
    return { status: "with_you", lastChangeDate: whereabout.createdAt };
  }
  return { status: "stored", lastChangeDate: whereabout.createdAt };
}

/**
 * loadItemContext — Whereabouts aksiyon uçlarının ortak kurulum adımını yapan yardımcı: item'ın
 * tenant'a aitliğini doğrular (değilse 403), son iki whereabouts kaydını çeker ve getItemPolicy ile
 * mevcut state machine bayraklarını hesaplar. Aksiyon endpoint'leri (took/left/move/missing/notSet)
 * bu fonksiyonu çağırıp dönen policy üzerinden ilgili can* bayrağını kontrol eder.
 */
async function loadItemContext(
  itemId: string,
  payload: { tenantId: string; userId: string }
): Promise<{
  latest: WhereaboutRow | undefined;
  previous: WhereaboutRow | undefined;
  policy: ReturnType<typeof getItemPolicy>;
}> {
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)),
    columns: { id: true },
  });
  if (!item) throw new HTTPException(403, { message: "Access denied" });

  const rows = await db.query.itemsWhereAbouts.findMany({
    where: eq(itemsWhereAbouts.itemId, itemId),
    orderBy: desc(itemsWhereAbouts.createdAt),
    limit: 2,
  });
  const latest = rows[0];
  const previous = rows[1];
  const policy = getItemPolicy(latest, previous, payload.userId);
  return { latest, previous, policy };
}

/**
 * setItemLocation — itemsWhereAbouts'a yeni bir satır ekler; bir item'ın konumunu değiştiren tek
 * giriş noktası. Girdi: itemId; containerId, userId ve locationDescription (üçü de opsiyonel, null
 * de kabul edilir); emptyKind ("missing" | "not_set", yalnızca üçü de boşken kullanılır, default
 * "missing"). Davranış: containerId ve userId aynı anda dolu olamaz (çağıran hata yapmasın diye
 * erken hata atar — CHECK constraint zaten DB seviyesinde de korur). kind otomatik türetilir:
 * containerId, userId veya locationDescription'dan en az biri doluysa "stored"; üçü de null ise
 * emptyKind. Ownership/tenant kontrolü ve state machine doğrulaması yapmaz — bunlar çağıran ucun
 * sorumluluğunda (loadItemContext + policy bayrakları). Çıktı: eklenen whereabouts satırı.
 */
export async function setItemLocation(
  itemId: string,
  containerId?: string | null,
  userId?: string | null,
  locationDescription?: string | null,
  emptyKind?: "missing" | "not_set"
): Promise<WhereaboutRow> {
  if (containerId && userId) {
    throw new Error("A whereabouts row cannot have both containerId and userId");
  }
  const hasAnyLocation = !!(containerId || userId || locationDescription);
  const kind: "stored" | "missing" | "not_set" = hasAnyLocation
    ? "stored"
    : (emptyKind ?? "missing");

  const [row] = await db
    .insert(itemsWhereAbouts)
    .values({
      itemId,
      containerId: containerId ?? null,
      userId: userId ?? null,
      locationDescription: locationDescription ?? null,
      kind,
    })
    .returning();
  if (!row) throw new Error("Failed to insert whereabouts row");
  return row;
}




/**
 * getItemPolicy — Item'ın son iki whereabouts kaydı ve aktif userId'den hangi aksiyonların geçerli
 * olduğunu hesaplayan saf fonksiyon (state machine). Mantık latest.kind üzerinden dallanır:
 * kayıt yoksa veya kind="missing"/"not_set" ise yalnızca canTake; kind="stored" + aktif user (with_you)
 * ise canMove/canMarkMissing/canMarkNotSet, ek olarak previous'ta konum bilgisi (containerId veya
 * locationDescription) varsa canLeave; kind="stored" + başka kullanıcıda ise yalnızca canMarkMissing;
 * kind="stored" + userId null (container'da ya da description-only) ise canTake, canMarkMissing,
 * canMarkNotSet. Hem detay cevabı hem aksiyon endpoint'lerindeki 409 doğrulaması için kullanılır.
 */
export function getItemPolicy(
  latest: WhereaboutRow | undefined,
  previous: WhereaboutRow | undefined,
  userId: string
): {
  canTake: boolean;
  canLeave: boolean;
  canMove: boolean;
  canMarkMissing: boolean;
  canMarkNotSet: boolean;
} {
  // not_set (kayıt yok) veya missing/not_set satırı: yalnızca "Take it" geçerli
  if (!latest || latest.kind === "missing" || latest.kind === "not_set") {
    return { canTake: true, canLeave: false, canMove: false, canMarkMissing: false, canMarkNotSet: false };
  }
  // kind === "stored" — üç alt durum

  // aktif user (with_you)
  if (latest.userId === userId) {
    const prevHasLocation = !!(previous?.containerId || previous?.locationDescription);
    return {
      canTake: false,
      canLeave: prevHasLocation,
      canMove: true,
      canMarkMissing: true,
      canMarkNotSet: true,
    };
  }
  // başka kullanıcıda
  if (latest.userId) {
    return { canTake: false, canLeave: false, canMove: false, canMarkMissing: true, canMarkNotSet: false };
  }
  // container'da veya description-only (her ikisi için aynı politika)
  return { canTake: true, canLeave: false, canMove: false, canMarkMissing: true, canMarkNotSet: true };
}

export default app;
