import { Hono } from "hono";
import { type AppVariables } from "../index.ts";
import { jwtMiddleware } from "../index.ts";
import { db, tenants } from "@item-locate/db";
import { containers, items, containersItems  } from "@item-locate/db";
import { eq, and } from "drizzle-orm";
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
    .from(containersItems)
    .innerJoin(items, eq(containersItems.itemId, items.id))
    .where(eq(containersItems.containerId, containerId));

  return c.json(itemList);
})

app.get("/containers/:id/items/:itemId", zValidator("param", z.object({ id: z.uuid(), itemId: z.uuid() })), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: containerId } = c.req.valid("param");

  const [container] = await db
    .select()
    .from(containers)
    .where(and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)));
  if (!container) throw new HTTPException(403, { message: "Access denied" });

  const { itemId } = c.req.valid("param");

  const [item] = await db
    .select()
    .from(containersItems)
    .innerJoin(items, eq(items.id, containersItems.itemId))
    .where(and(eq(containersItems.containerId, containerId), eq(containersItems.itemId, itemId)));
  if (!item) throw new HTTPException(404, { message: "Item not found" });

  return c.json(item);
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

app.post("/containers/:id/items/:itemId", zValidator("param", containerItemSchema), jwtMiddleware, async (c) => {

    const payload = c.get("jwtPayload");
    const { id: containerId, itemId } = c.req.valid("param");

    const [container] = await db
      .select()
      .from(containers)
      .where(and(eq(containers.id, containerId), eq(containers.tenantId, payload.tenantId)));
    if (!container) throw new HTTPException(403, { message: "Access denied" });

    const [item] = await db
      .select()
      .from(items)
      .where(and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)));
    if (!item) throw new HTTPException(403, { message: "Access denied" });

    const [containersItem] = await db
      .insert(containersItems)
      .values({
        containerId,
        itemId,
        userId: payload.userId,
        status: item.status
      })
      .returning();

    return c.json(containersItem, 201);
  }
)

export default app;
