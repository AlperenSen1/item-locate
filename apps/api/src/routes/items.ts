import { Hono } from "hono";
import { type AppVariables } from "../types.ts";
import { jwtMiddleware } from "../middleware.ts";
import { db } from "@item-locate/db";
import { items, itemsWhereAbouts, users, containers } from "@item-locate/db";
import { eq, and, desc } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { idParamSchema, postItemSchema } from "@item-locate/types";
import { HTTPException } from "hono/http-exception";


const app = new Hono<{ Variables: AppVariables }>();

app.get("/", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");

  const userItems = await db.query.items.findMany({
    where: eq(items.tenantId, payload.tenantId),
    columns: {
      id: true,
      name: true,
      isPinned: true,
      isHidden: true,
      status: true
    }
  })

  return c.json(userItems);
});

app.get("/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId))
  })
  if (!item) throw new HTTPException(403, { message: "Access denied" });

  return c.json(item);
})

app.post("/", zValidator("json", postItemSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const [item] = await db
    .insert(items)
    .values({
      ...c.req.valid("json"),
      tenantId: payload.tenantId,
    })
    .returning();

  return c.json(item, 201);
})

app.get("/:id/where", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  // item bu tenant'a ait mi?
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId))
  })
  if (!item) throw new HTTPException(403, { message: "Access denied" });

  // en son whereabouts kaydını al
  const whereabout = await db.query.itemsWhereAbouts.findFirst({
    where: eq(itemsWhereAbouts.itemId, itemId),
    orderBy: desc(itemsWhereAbouts.createdAt)
  })
  if (!whereabout) throw new HTTPException(404, { message: "Item history not found" });

  // containerId dolu, userId boş → container'da
  if (whereabout.containerId && !whereabout.userId) {
    const container = await db.query.containers.findFirst({
      where: eq(containers.id, whereabout.containerId)
    })
    return c.json({ container });
  }

  // containerId boş, userId dolu → kullanıcıda
  if (!whereabout.containerId && whereabout.userId) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, whereabout.userId),
      columns: {
        id: true,
        name: true,
        email: true
      }
    })
    return c.json({ user });
  }

  // ikisi de boş → missing
  return c.json({ message: "missing" });
});

app.post("/:id/missing", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  // item bu tenant'a ait mi?
  const item = await db.query.items.findFirst({
    where: and(eq(items.id, itemId), eq(items.tenantId, payload.tenantId))
  })
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
