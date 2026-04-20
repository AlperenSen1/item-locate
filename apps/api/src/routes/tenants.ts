import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { sign, verify, jwt } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "@item-locate/db";
import { users, tenants, tenantsUsers } from "@item-locate/db";
import { type AppVariables, jwtMiddleware } from "../index";


const app = new Hono<{ Variables: AppVariables }>();


app.get("/tenants", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload"); //retuns unknown, thats why i used AppVariables

  const userTenants = await db
    .select()
    .from(tenantsUsers)
    .innerJoin(tenants, eq(tenantsUsers.tenantId, tenants.id))
    .where(eq(tenantsUsers.userId, payload.userId));

  return c.json(userTenants);
})

export default app;
