import { Hono } from "hono";
import { type AppVariables } from "../types.ts";
import { jwtMiddleware } from "../middleware.ts";
import { db, tenants } from "@item-locate/db";
import { containers, items, itemsWhereAbouts  } from "@item-locate/db";
import { eq, and, inArray, max, cosineDistance, sql, desc } from "drizzle-orm";
import { idParamSchema, postContainerSchema, postContainersItemsSchema } from "@item-locate/types";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { getImageEmbedding, getImageDescription } from "../embeddings.ts";


const app = new Hono<{ Variables: AppVariables }>();

app.get("/containers", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");

  const containerList = await db.query.containers.findMany({
    where: eq(containers.tenantId, payload.tenantId),
    columns: {
      id: true,
      name: true,
      isHidden: true
    }
  })

  return c.json(containerList);
})

app.get("/containers/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const { id: containerId } = c.req.valid("param");

  const container = await db.query.containers.findFirst({
    where: and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId))
  })
  if (!container) throw new HTTPException(403, { message: "Access denied" });

  return c.json(container);
})

app.get("/containers/:id/items", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: containerId } = c.req.valid("param");

  const container = await db.query.containers.findFirst({
    where: and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId))
  })
  if (!container) throw new HTTPException(403, { message: "Access denied" });

  const itemList = await db
    .select({
      id: items.id,
      name: items.name,
      isPinned: items.isPinned,
      status: items.status,
    })
    .from(itemsWhereAbouts)
    .innerJoin(items, eq(itemsWhereAbouts.itemId, items.id))
    .where(and(
      eq(itemsWhereAbouts.containerId, containerId),
      eq(
        itemsWhereAbouts.createdAt,
        db.select({ maxDate: max(itemsWhereAbouts.createdAt) })
          .from(itemsWhereAbouts)
          .where(eq(itemsWhereAbouts.itemId, items.id))
          .as("maxDate")
      )
    ))

  return c.json(itemList);
})

app.post("/containers", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");

  const body = await c.req.parseBody();

  const parsed = postContainerSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues }, 400);
  }

  const photo = body["photo"];
  let embedding: number[] | null = null;

  if (photo instanceof File) {
    const arrayBuffer = await photo.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    embedding = await getImageEmbedding(base64);
  }

  const [container] = await db
    .insert(containers)
    .values({ ...parsed.data, embedding, tenantId: payload.tenantId })
    .returning();

  return c.json(container, 201);
});

app.post("/containers/:id/items/:itemId",
  zValidator("param", postContainersItemsSchema),
  jwtMiddleware,
  async (c) => {
    const payload = c.get("jwtPayload");
    const { id: containerId, itemId } = c.req.valid("param");

    // konteyner aktif tenant ile ilişkili mi
    const container = await db.query.containers.findFirst({
      where: and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId))
    })
    if (!container) throw new HTTPException(403, { message: "Access denied" });

    // item aktif tenant ile ilişkili mi
    const item = await db.query.items.findFirst({
      where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId))
    })
    if (!item) throw new HTTPException(403, { message: "Access denied" });

    const result = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(itemsWhereAbouts)
        .values({
          itemId,
          userId: null,
          containerId,
        })
        .returning();

      await tx
        .update(items)
        .set({ status: "stored" })
        .where(eq(items.id, itemId));

      return inserted;
    });

    return c.json(result, 201);
  }
)

app.post("/containers/match", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");

  const body = await c.req.parseBody();
  const photo = body["photo"];
  const itemName = body["itemName"] as string;

  if (!(photo instanceof File)) {
    return c.json({ error: "Photo is required" }, 400);
  }

  if (!itemName) {
    return c.json({ error: "itemName is required" }, 400);
  }

  // Fotoğrafı base64'e çevir
  const arrayBuffer = await photo.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Önce embedding oluştur
  const embedding = await getImageEmbedding(base64);

  // Sonra container match'i bul
  const similarity = sql<number>`1 - (${cosineDistance(containers.embedding, embedding)})`;
  const [match] = await db
    .select({ id: containers.id, name: containers.name, similarity })
    .from(containers)
    .where(eq(containers.tenantId, payload.tenantId))
    .orderBy(desc(similarity))
    .limit(1);

  const container = match && match.similarity >= 0.7 ? match : null;

  // En son description oluştur — container adını da gönder
  const description = await getImageDescription(
    base64,
    itemName,
    container?.name
  );

  return c.json({
    description,
    match: container
  });
});

export default app;
