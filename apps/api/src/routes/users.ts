
import { Hono } from "hono";
import { type AppVariables, jwtMiddleware} from "../index.ts";
import { db } from "@item-locate/db";
import { items, itemsWhereAbouts } from "@item-locate/db";
import { eq, and } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { idParamSchema, postItemSchema } from "@item-locate/validators";
import { HTTPException } from "hono/http-exception";

const app = new Hono<{ Variables: AppVariables }>();

app.post("/users/me/items/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: itemId } = c.req.valid("param");

  //item aktif tenant ile ilşkili mi
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
        userId: payload.userId,
        containerId: null,
      })
      .returning();

    await tx
      .update(items)
      .set({ status: "stored" })
      .where(eq(items.id, itemId));

    return inserted;

  });

  return c.json(result, 201);

});

export default app;
