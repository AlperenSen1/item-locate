import { Hono } from "hono";
import { type AppVariables, jwtMiddleware} from "../index.ts";
import { db } from "@item-locate/db";
import { items } from "@item-locate/db";
import { eq, and } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { idParamSchema } from "@item-locate/validators";
import { HTTPException } from "hono/http-exception";


const app = new Hono<{ Variables: AppVariables }>();

app.get("/items", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const userItems = await db
    .select()
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


export default app;
