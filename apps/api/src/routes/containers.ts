import { Hono } from "hono";
import { type AppVariables } from "../index.ts";
import { jwtMiddleware } from "../index.ts";
import { db, tenants } from "@item-locate/db";
import { containers, items, itemsWhereAbouts  } from "@item-locate/db";
import { eq, and, inArray, max } from "drizzle-orm";
import { idParamSchema, postContainerSchema, containerItemSchema } from "@item-locate/validators";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

const app = new Hono<{ Variables: AppVariables }>();

app.get("/containers", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");

  const containerList = await db
    .select({
      id: containers.id,
      name: containers.name,
      isHidden: containers.isHidden,
    })
    .from(containers)
    .where(eq(containers.tenantId, payload.tenantId))

  return c.json(containerList);
})

app.get("/containers/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const { id: containerId } = c.req.valid("param");

  const [container] = await db
    .select()
    .from(containers)
    .where(and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)));
  if (!container) throw new HTTPException(403, { message: "Access denied" });

  return c.json(container);
})

app.get("/containers/:id/items", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: containerId } = c.req.valid("param");

  const [container] = await db
    .select()
    .from(containers)
    .where(and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)));
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


// !!!!!!!!auth-register da kendimiz insertion için hata mesajı oluşturmuşken burada neden oluşturmadık ANLAMADIM
app.post("/containers", zValidator("json", postContainerSchema), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const { name, description, location, className, isHidden } = c.req.valid("json");

  const [container] = await db
    .insert(containers)
    .values({ name, description, location, className, isHidden, tenantId: payload.tenantId })
    .returning();

  return c.json(container, 201); //burada oluşturduğumuz container bilgilerini dönmek mi mantıklı yoksa successfully created 201 yeter mi

})

app.post("/containers/:id/items/:itemId",
  zValidator("param", z.object({ id: z.uuid(), itemId: z.uuid() })),
  jwtMiddleware,
  async (c) => {
    const payload = c.get("jwtPayload");
    const { id: containerId, itemId } = c.req.valid("param");

    // konteyner aktif tenant ile ilişkili mi
    const [container] = await db
      .select()
      .from(containers)
      .where(and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)));
    if (!container) throw new HTTPException(403, { message: "Access denied" });

    // item aktif tenant ile ilişkili mi
    const [item] = await db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)));
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

export default app;
