import { Hono } from "hono";
import { eq, and, count } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { sign, verify, jwt } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "@item-locate/db";
import { idParamSchema } from "@item-locate/validators";
import { users, tenants, tenantsUsers, containers } from "@item-locate/db";
import { type AppVariables, jwtMiddleware } from "../index";
import z from "zod";
import { id } from "zod/v4/locales";


const app = new Hono<{ Variables: AppVariables }>();

//returns all tenants' infos that the user is a member or admin of
app.get("/tenants", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload"); //retuns unknown, thats why i used AppVariables

  const tenantList = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      createdAt: tenants.createdAt,
    })
    .from(tenantsUsers)
    .innerJoin(tenants, eq(tenantsUsers.tenantId, tenants.id))
    .where(eq(tenantsUsers.userId, payload.userId));

  return c.json(tenantList);
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
    .select({
      id: users.id,
      name: users.name,
      role: tenantsUsers.role
    })
    .from(tenantsUsers)
    .innerJoin(users, eq(tenantsUsers.userId, users.id))
    .where(eq(tenantsUsers.tenantId, tenantId));

  return c.json(members);
});

app.get("/tenants/:id/users/:userId", zValidator("param", z.object({ id: z.uuid(), userId: z.uuid() })), jwtMiddleware, async (c) => {

    const payload = c.get("jwtPayload");
    const { id: tenantId, userId } = c.req.valid("param");

    // kullanıcının bu tenant'a üyeliği var mı ve admin mi?
    const [membership] = await db
      .select()
      .from(tenantsUsers)
      .where(and(
        eq(tenantsUsers.userId, payload.userId),
        eq(tenantsUsers.tenantId, tenantId)
      ));

    if (!membership || membership.role !== "admin") throw new HTTPException(403, { message: "Access denied" });

    // erişim serbest, istenen kullanıcının bilgilerini getir
    const [user] = await db
      .select({
        id: users.id,
        role: tenantsUsers.role,
        membershipCreatedAt: tenantsUsers.createdAt,
        membershipUpdatedAt: tenantsUsers.updatedAt,
        name: users.name,
        email: users.email,
        CreatedAt: users.createdAt,
        UpdatedAt: users.updatedAt,
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

app.post("/tenants", zValidator("json", z.object({ name: z.string().min(1, { message: "Name is required" }) })), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { name } = c.req.valid("json");

  // kullanıcının adını çek
  const [user] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, payload.userId));

  const tenant = await db.transaction(async (tx) => {
    //yeni tenant'ı oluştur
    const [newTenant] = await tx
      .insert(tenants)
      .values({
        name: name,
      })
      .returning();
    if (!newTenant) throw new Error("Tenant insertion failed");

    // oluşturan kullanıcıyı admin olarak bu tenant'a üye et
    await tx
      .insert(tenantsUsers)
      .values({
        userId: payload.userId,
        tenantId: newTenant.id,
        role: "admin",
      })

    // bu tenant ile ilişkili, bu tenant'ı oluşturan kullanıcıyı temsil edecek container oluştur.
    await tx
      .insert(containers)
      .values({
        tenantId: newTenant.id,
        name: user!.name,
        description: "Items with me"
      })

    return newTenant;

  })

  return c.json(tenant, 201);
});


export default app;
