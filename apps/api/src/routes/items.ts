import { Hono } from "hono";
import { type AppVariables, jwtMiddleware} from "../index.ts";
import { db } from "@item-locate/db";
import { items, itemsWhereAbouts, users, containers } from "@item-locate/db";
import { eq, and, desc } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { idParamSchema, postItemSchema } from "@item-locate/validators";
import { HTTPException } from "hono/http-exception";


const app = new Hono<{ Variables: AppVariables }>();

app.get("/items", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const userItems = await db
    .select({
      id: items.id,
      name: items.name,
      isPinned: items.isPinned,
      isHidden: items.isHidden,
      status: items.status,
    })
    .from(items)
    .where(eq(items.tenantId, payload.tenantId));

  return c.json(userItems);
});

app.get("/items/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)));
  if (!item) throw new HTTPException(403, { message: "Access denied" });

  return c.json(item);
})

app.post("/items", zValidator("json", postItemSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { name, category, location, className, isPinned, isHidden } = c.req.valid("json");
  const [item] = await db
    .insert(items)
    .values({
      name,
      category,
      location,
      className,
      isPinned,
      isHidden,
      tenantId: payload.tenantId,
    })
    .returning();

  return c.json(item, 201);
})

app.get("/items/:id/where", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  // item bu tenant'a ait mi?
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId)));
  if (!item) throw new HTTPException(403, { message: "Access denied" });

  // en son whereabouts kaydını al
  const [whereabout] = await db
    .select()
    .from(itemsWhereAbouts)
    .where(eq(itemsWhereAbouts.itemId, itemId))
    .orderBy(desc(itemsWhereAbouts.createdAt))
    .limit(1);

  if (!whereabout) throw new HTTPException(404, { message: "Item history not found" });

  // containerId dolu, userId boş → container'da
  if (whereabout.containerId && !whereabout.userId) {
    const [container] = await db
      .select()
      .from(containers)
      .where(eq(containers.id, whereabout.containerId));
    return c.json({ container });
  }

  // containerId boş, userId dolu → kullanıcıda
  if (!whereabout.containerId && whereabout.userId) {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, whereabout.userId));
    return c.json({ user });
  }

  // ikisi de boş → missing
  return c.json({ message: "missing" });
});

app.post("/items/:id/missing", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  // item bu tenant'a ait mi?
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
        containerId: null,
        userId: null,
      })
      .returning();

    await tx
      .update(items)
      .set({ status: "missing" })
      .where(eq(items.id, itemId));

    return inserted;
  });

  return c.json(result, 201);
});

export default app;
