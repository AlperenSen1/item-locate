import { Hono } from "hono";
import { type AppVariables } from "../types.ts";
import { jwtMiddleware } from "../middleware.ts";
import { db, tenants } from "@item-locate/db";
import { containers, items, itemsWhereAbouts, premises } from "@item-locate/db";
import { eq, and, inArray, max, cosineDistance, sql, desc, isNotNull } from "drizzle-orm";
import { idParamSchema, postContainerSchema, patchContainerSchema } from "@item-locate/types";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getImageEmbedding, getImageDescription } from "../embeddings.ts";


const app = new Hono<{ Variables: AppVariables }>();

/**
 * GET /containers — Doğrulanmış tenant'ın container'larını, her birinde şu an bulunan item sayısıyla
 * birlikte listeler. Input: JWT'den tenantId (ekstra parametre almaz). Her container için, güncel konumu
 * (en son whereabouts kaydı) o container olan item'ları korelasyonlu bir subquery ile sayar — taşınmış
 * item'lar sayıma girmez. Output (200): container dizisi, her container'da id, name, className ve itemCount.
 */
app.get("/containers", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");

  const itemCountSubquery = sql<number>`(
    SELECT COUNT(*) FROM items_where_abouts iwa
    WHERE iwa.container_id = ${containers.id}
    AND iwa.created_at = (
      SELECT MAX(created_at) FROM items_where_abouts
      WHERE item_id = iwa.item_id
    )
  )`.as("item_count");

  const containerList = await db.query.containers.findMany({
    where: eq(containers.tenantId, payload.tenantId),
    columns: { id: true, name: true, className: true },
    extras: { itemCount: itemCountSubquery }
  });

  return c.json(containerList);
});


/**
 * GET /containers/:id — Doğrulanmış tenant'ın bir container'ının detayını, içindeki güncel item'lar ve
 * toplam item sayısıyla birlikte döndürür. Input: URL param id (uuid) ve JWT (tenant). Container'ın bu
 * tenant'a ait olduğunu kontrol eder (değilse 403) ve embedding hariç alanlarını alır; ayrıca güncel konumu
 * (en son whereabouts kaydı) bu container olan item'ları çeker. Output (200): container alanları (embedding
 * hariç) + itemCount (içindeki item sayısı) + items dizisi (her item'da id, name, className).
 */
app.get("/containers/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: containerId } = c.req.valid("param");

  // container bu tenant'a ait mi? (embedding hariç tüm alanlar)
  const container = await db.query.containers.findFirst({
    where: and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)),
    columns: { embedding: false },
  });
  if (!container) throw new HTTPException(403, { message: "Access denied" });

  // güncel konumu (en son whereabouts kaydı) bu container olan item'lar
  const containedItems = await db
    .select({ id: items.id, name: items.name, className: items.className })
    .from(items)
    .innerJoin(itemsWhereAbouts, eq(itemsWhereAbouts.itemId, items.id))
    .where(
      and(
        eq(items.tenantId, payload.tenantId),
        eq(itemsWhereAbouts.containerId, containerId),
        sql`${itemsWhereAbouts.createdAt} = (SELECT MAX(created_at) FROM items_where_abouts WHERE item_id = ${items.id})`,
      ),
    );

  return c.json({ ...container, itemCount: containedItems.length, items: containedItems });
});

/**
 * POST /containers — Doğrulanmış tenant için yeni bir container yaratıp DB'ye kaydeder (genelde
 * /analyze/containers'ın döndürdüğü description, embedding ve premiseId ile çağrılır). Input (JSON):
 * name (zorunlu), className (opsiyonel, containerClassNameEnum), description (opsiyonel), embedding
 * (opsiyonel, 768 boyutlu number[]), premiseId (opsiyonel, uuid). Body'yi doğrular, premiseId verilmişse
 * o premise'nin bu tenant'a ait olduğunu kontrol eder ve container'ı ekler. Output (201): containerId ve
 * containerName. Body geçersizse 400, premise bu tenant'a ait değilse 403 döner.
 */
app.post("/containers", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const body = await c.req.json();
  const parsed = postContainerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const data = parsed.data;

  // If a premiseId is provided, make sure it belongs to this tenant.
  if (data.premiseId) {
    const premise = await db.query.premises.findFirst({
      where: and(
        eq(premises.id, data.premiseId),
        eq(premises.tenantId, payload.tenantId)
      ),
    });
    if (!premise) throw new HTTPException(403, { message: "Access denied" });
  }

  const [created] = await db
    .insert(containers)
    .values({
      ...data,
      tenantId: payload.tenantId,
    })
    .returning({
      containerId: containers.id,
      containerName: containers.name,
    });

  if (!created) {
    throw new HTTPException(500, { message: "Failed to create container" });
  }

  return c.json(created, 201);
});

/**
 * PATCH /containers/:id — Doğrulanmış tenant'ın bir container'ını kısmi olarak günceller. Input: URL param
 * id (uuid) ve JSON body'de name, isHidden, className description, premiseId, embedding alanları (hepsi opsiyonel
 * ama en az biri gönderilmeli). description, premiseId ve embedding birlikte tipik olarak yeni bir foto
 * analizinden gelir: client önce POST /analyze/containers'ı yeni foto + yeni name (+ opsiyonel lat/lng)
 * ile çağırır, dönen üçlüyü olduğu gibi bu uca forward eder. Kullanıcı foto değiştirmeden bilgileri
 * elle düzenlemek isterse description'ı serbest metin olarak yazabilir ve premiseId'yi GET /premises
 * listesinden seçebilir; embedding alanı elle güncellenmez (yalnızca analyze çıktısı geçerlidir, aksi
 * halde cosine similarity bozulur — yeni embedding istiyorsa client analyze'ı tekrar çağırmalı). Endpoint
 * containerId'nin bu tenant'a ait olduğunu kontrol eder (değilse 403); premiseId verilmişse onun da bu
 * tenant'a ait olduğunu doğrular (değilse 403). Output (200): güncellenen container'ın id, name,
 * className, description, premiseId, isHidden alanları (embedding hariç). Body geçersizse veya hiç alan
 * gelmezse 400 döner.
 */
app.patch("/containers/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: containerId } = c.req.valid("param");
  const body = await c.req.json();
  const parsed = patchContainerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  // container bu tenant'a ait mi?
  const container = await db.query.containers.findFirst({
    where: and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)),
    columns: { id: true },
  });
  if (!container) throw new HTTPException(403, { message: "Access denied" });

  // premiseId verildiyse, o da bu tenant'a ait mi?
  if (parsed.data.premiseId) {
    const premise = await db.query.premises.findFirst({
      where: and(eq(premises.id, parsed.data.premiseId), eq(premises.tenantId, payload.tenantId)),
      columns: { id: true },
    });
    if (!premise) throw new HTTPException(403, { message: "Access denied" });
  }

  const [updated] = await db
    .update(containers)
    .set(parsed.data)
    .where(and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)))
    .returning({
      id: containers.id,
      name: containers.name,
      className: containers.className,
      description: containers.description,
      premiseId: containers.premiseId,
      isHidden: containers.isHidden,
    });

  if (!updated) {
    throw new HTTPException(500, { message: "Failed to update container" });
  }

  return c.json(updated);
});

export default app;
