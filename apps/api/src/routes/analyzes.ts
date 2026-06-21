import { Hono } from "hono";
import { type AppVariables } from "../types.ts";
import { jwtMiddleware } from "../middleware.ts";
import { db } from "@item-locate/db";
import { containers } from "@item-locate/db";
import { eq, and, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { cosineDistance, desc } from "drizzle-orm";
import { getImageEmbedding, getImageDescription, getContainerDescription } from "../embeddings.ts";
import { analyzeLocationSchema, analyzeContainerSchema } from "@item-locate/types";
import { premises } from "@item-locate/db";


const app = new Hono<{ Variables: AppVariables }>();

// POST /analyze/item-location — Girdi (multipart, JWT): photo (JPEG, zorunlu) + itemName (zorunlu).
// Fotoğrafın embedding'ini üretip aynı tenant'taki container'lar içinde pgvector cosine similarity ile
// en yakınını bulur (eşik 0.7), ardından eşleşme varsa container adıyla daha spesifik, yoksa sahnedeki
// mobilyaya göre generic bir locationDescription üretir. Çıktı: { locationDescription, match: { containerId, containerName } | null }
// — locationDescription, POST /items'ın locationDescription field'ına; match.containerId ise containerId field'ına doğrudan
// geçirilebilecek şekilde tasarlanmıştır. containerName bilgisi frontend'de kullanıldığı için dönülmüştür.
// Embedding kalıcı değildir, sadece eşleştirme için kullanılır.
const MATCH_THRESHOLD = 0.7;

app.post("/analyze/item-location", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const body = await c.req.parseBody();

  const parsed = analyzeLocationSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }
  const { itemName, photo } = parsed.data;

  // Fotoğrafı base64'e çevir
  const arrayBuffer = await photo.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Embedding oluştur (geçici — hiçbir yere yazılmıyor)
  const embedding = await getImageEmbedding(base64);

  // En benzer container'ı bul
  const similarity = sql<number>`1 - (${cosineDistance(containers.embedding, embedding)})`;
  const [match] = await db
    .select({ id: containers.id, name: containers.name, similarity })
    .from(containers)
    .where(
      and(
        eq(containers.tenantId, payload.tenantId),
        isNotNull(containers.embedding), // NULL embedding'liler eşleşmeye girmesin
      ),
    )
    .orderBy(desc(similarity))
    .limit(1);

  // 0.7 altındaysa eşleşme yok
  const matchedContainer =
    match && match.similarity >= MATCH_THRESHOLD
      ? { id: match.id, name: match.name }
      : null;

  // Description — match varsa container adıyla daha spesifik prompt
  const locationDescription = await getImageDescription(
    base64,
    itemName,
    matchedContainer?.name,
  );

  return c.json({
    locationDescription,
    match: matchedContainer
      ? { containerId: matchedContainer.id, containerName: matchedContainer.name }
      : null,
  });
});

/**
 * POST /analyze/containers — Yeni container için analiz yapar, DB'ye hiçbir şey yazmaz (yaratma işi
 * POST /containers'ta). Input (multipart): name (zorunlu), photo (zorunlu), lat ve lng (opsiyonel, birlikte
 * verilir). photo'dan embedding üretir; lat/lng verildiyse en yakın premise'yi bulup adını description
 * prompt'unda kullanır (yoksa name'e dayalı generic açıklama). Output (200): description (string — container
 * ve içeriğini özetleyen kısa ifade), embedding (number[]) ve premiseId (uuid | null — lat/lng yoksa ya
 * da eşleşme yoksa null). Dönüş alanları POST /containers'ın body field'larıyla birebir aynı isimde olduğu
 * için client tarafında doğrudan forward edilebilir. Body geçersizse veya photo eksikse 400 döner.
 */
app.post("/analyze/containers", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const body = await c.req.parseBody();
  const parsed = analyzeContainerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const { name, lat, lng } = parsed.data;

  const photo = body["photo"];
  if (!(photo instanceof File)) {
    return c.json({ error: "photo is required" }, 400);
  }

  // Photo -> base64 -> embedding
  const arrayBuffer = await photo.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  const embedding = await getImageEmbedding(base64);

  // lat/lng verildiyse, bu tenant'ın en yakın premise'sini bul (yalnızca description'ı zenginleştirmek için).
  let premise: typeof premises.$inferSelect | undefined;
  if (lat !== undefined && lng !== undefined) {
    [premise] = await db
      .select()
      .from(premises)
      .where(eq(premises.tenantId, payload.tenantId))
      .orderBy(sql`${premises.location} <-> point(${lng}, ${lat})`)
      .limit(1);
  }

  // Description üret (premise'e göre iki prompt modu).
  const description = await getContainerDescription(base64, name, premise?.name);

  return c.json(
      {
        description,
        embedding,
        premiseId: premise?.id ?? null,
      },
      200
    );

});

export default app;
