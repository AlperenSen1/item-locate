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

// returns the tenant info by id, if the user is a member or admin of that tenant
app.get("/tenants/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: tenantId } = c.req.valid("param");

  // kullanıcının bu tenant'a üyeliği var mı?
  const [membership] = await db
    .select()
    .from(tenantsUsers)
    .where(and(
      eq(tenantsUsers.userId, payload.userId),
      eq(tenantsUsers.tenantId, tenantId)
    ));

  if (!membership) throw new HTTPException(403, { message: "Access denied" });

  // erişim serbest, tenant bilgilerini getir
  const [tenant] = await db
    .select({
      name: tenants.name,
      createdAt: tenants.createdAt,
      memberCount: db
        .select({ count: count() })
        .from(tenantsUsers)
        .where(eq(tenantsUsers.tenantId, tenants.id))
        .as("memberCount"),
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));

  return c.json(tenant);
});

app.get("/tenants/:id/users", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { id: tenantId } = c.req.valid("param");

  // kullanıcının bu tenant'a üyeliği var mı?
  const [membership] = await db
    .select()
    .from(tenantsUsers)
    .where(and(
      eq(tenantsUsers.userId, payload.userId),
      eq(tenantsUsers.tenantId, tenantId)
    ));

  if (!membership) throw new HTTPException(403, { message: "Access denied" });

  // erişim serbest, tenant'ın kullanıcılarını getir
  const members = await db
    .select()
    .from(tenantsUsers)
    .where(eq(tenantsUsers.tenantId, tenantId));

  return c.json(members);
});

app.get("/tenants/:id/users/:userId",
  zValidator("param", z.object({ id: z.uuid(), userId: z.uuid() })),
  jwtMiddleware,
  async (c) => {
    const payload = c.get("jwtPayload");
    const { id: tenantId, userId } = c.req.valid("param");

    // kullanıcının bu tenant'a üyeliği var mı?
    const [membership] = await db
      .select()
      .from(tenantsUsers)
      .where(and(
        eq(tenantsUsers.userId, payload.userId),
        eq(tenantsUsers.tenantId, tenantId)
      ));

    if (!membership) throw new HTTPException(403, { message: "Access denied" });

    // erişim serbest, istenen kullanıcının bilgilerini getir
    const [user] = await db
      .select({
        userId: tenantsUsers.userId,
        role: tenantsUsers.role,
        membershipCreatedAt: tenantsUsers.createdAt,
        membershipUpdatedAt: tenantsUsers.updatedAt,
        userName: users.name,
        userEmail: users.email,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
      })
      .from(tenantsUsers)
      .innerJoin(users, eq(tenantsUsers.userId, users.id))
      .where(and(
        eq(tenantsUsers.userId, userId),
        eq(tenantsUsers.tenantId, tenantId)
      ));

    if (!user) throw new HTTPException(404, { message: "User not found" });

    return c.json(user);
  }
);




export default app;
