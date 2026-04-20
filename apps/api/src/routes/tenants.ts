import { Hono } from "hono";
import { eq, and, count } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { sign, verify, jwt } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "@item-locate/db";
import { tenantSchema } from "@item-locate/validators";
import { users, tenants, tenantsUsers } from "@item-locate/db";
import { type AppVariables, jwtMiddleware } from "../index";
import z from "zod";


const app = new Hono<{ Variables: AppVariables }>();

//returns all tenants' infos that the user is a member or admin of
app.get("/tenants", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload"); //retuns unknown, thats why i used AppVariables

  const userTenants = await db
    .select()
    .from(tenantsUsers)
    .innerJoin(tenants, eq(tenantsUsers.tenantId, tenants.id))
    .where(eq(tenantsUsers.userId, payload.userId));

  return c.json(userTenants);
});

app.get("/tenants/:id", zValidator("param", tenantSchema), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const tenantId = c.req.param("id");

  const [member] = await db
    .select()
    .from(tenantsUsers)
    .where(and(eq(tenantsUsers.userId, payload.userId), eq(tenantsUsers.tenantId, tenantId)));
  if (!member) throw new HTTPException(403, { message: "Access denied" });

  const [tenant] = await db
    .select({
      name: tenants.name,
      createdAt: tenants.createdAt,
      memberCount: count(tenantsUsers.id)
    })
    .from(tenants)
    .innerJoin(tenantsUsers, eq(tenantsUsers.tenantId, tenants.id))
    .where(eq(tenants.id, tenantId));

  return c.json(tenant);
});


export default app;
