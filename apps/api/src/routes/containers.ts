import { Hono } from "hono";
import { type AppVariables } from "../index.ts";
import { jwtMiddleware } from "../index.ts";
import { db } from "@item-locate/db";
import { containers } from "@item-locate/db";
import { eq, and } from "drizzle-orm";
import { idParamSchema } from "@item-locate/validators";
import { zValidator } from "@hono/zod-validator";
import { HTTPException } from "hono/http-exception";


const app = new Hono<{ Variables: AppVariables }>();

app.get("/containers", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");

  const containerList = await db
    .select()
    .from(containers)
    .where(eq(containers.tenantId, payload.tenantId))

  return c.json(containerList);
})

app.get("/containers/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const { id } =c.req.valid("param")

  const [container] = await db
    .select()
    .from(containers)
    .where(and(eq(containers.id, id), eq(containers.tenantId, payload.tenantId)));
  if (!container) throw new HTTPException(403, { message: "Access denied" });

  return c.json(container);
})

export default app;
