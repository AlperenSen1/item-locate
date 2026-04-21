import { Hono } from "hono";
import { eq, and, count } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { sign, verify, jwt } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "@item-locate/db";
import { idParamSchema } from "@item-locate/validators";
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

app.get("/tenants/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const { id: tenantId } = c.req.valid("param");

  const [tenant] = await db
    .select({
      name: tenants.name,
      createdAt: tenants.createdAt,
      memberCount: db
        .select({ count: count()})
        .from(tenantsUsers)
        .where(eq(tenantsUsers.tenantId, tenants.id)) // SEBEBİ ANLAŞILMADI, innerJoin gibi sütunlardan bağlamıyoruz ki neden tenantId kullanamayalım?
        .as("memberCount"), // SEBEBİ ANLAŞILMADI, zaten iç sorgu çıktısı dış sorgunun selectine memberCount adıyla gidiyor.
    })
    .from(tenantsUsers)
    .innerJoin(tenants, eq(tenants.id, tenantsUsers.tenantId))
    .where(and(eq(tenantsUsers.tenantId, tenantId), eq(tenantsUsers.userId, payload.userId)));
  if (!tenant) throw new HTTPException(403, { message: "Access denied" });

  return c.json(tenant);
});


export default app;
