import { Hono } from "hono";
import { eq, and, count } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { sign, verify, jwt } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "@item-locate/db";
import { idParamSchema, postTenantsUsersSchema, roleEnum } from "@item-locate/types";
import { users, tenants, tenantsUsers, containers } from "@item-locate/db";
import { type AppVariables } from "../types.ts";
import { jwtMiddleware } from "../middleware.ts";
import z from "zod";
import { id } from "zod/v4/locales";



const app = new Hono<{ Variables: AppVariables }>();

//returns all tenants' infos that the user is a member or admin of
app.get("/tenants", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload"); //retuns unknown, thats why i used AppVariables


  const tenantsUsersList = await db.query.tenantsUsers.findMany({
    where: eq(tenantsUsers.userId, payload.userId),
    with: {
      tenant: {
        columns: {
          id: true,
          name: true,
          createdAt: true
        }
      }
    }
  })

  const tenantList = tenantsUsersList.map(tu => tu.tenant)

  return c.json(tenantList);
});



app.get("/tenants/users", jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");

  const tenantsMembers = await db.query.tenantsUsers.findMany({
    where: eq(tenantsUsers.tenantId, payload.tenantId),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
        }
      }
    }
  })

  const members = tenantsMembers.map(tm => ({
    ...tm.user,
    role: tm.role
  }) )

  return c.json(members);
});

app.get("/tenants/users/:userId", zValidator("param", z.object({ userId: z.uuid() })), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const { userId } = c.req.valid("param");

  const isAdmin = await db.query.tenantsUsers.findFirst({
    where: and(
      eq(tenantsUsers.userId, payload.userId),
      eq(tenantsUsers.tenantId, payload.tenantId),
      eq(tenantsUsers.role, "admin")
    )
  })
  if (!isAdmin) throw new HTTPException(403, { message: "Access denied" });

  const tenantsUser = await db.query.tenantsUsers.findFirst({
    where: and(
      eq(tenantsUsers.userId, userId),
      eq(tenantsUsers.tenantId, payload.tenantId)
    ),
    with: {
      user: {
        columns: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  })

  const user = {
    ...tenantsUser?.user,
    role: tenantsUser?.role,
    membershipCreatedAt: tenantsUser?.createdAt,
    membershipUpdatedAt: tenantsUser?.updatedAt,
  }

  if (!user) throw new HTTPException(404, { message: "User not found" });

  return c.json(user);
  }
);

app.post("/tenants", zValidator("json", z.object({ name: z.string().min(1, { message: "Name is required" }) })), jwtMiddleware, async (c) => {

  const payload = c.get("jwtPayload");
  const { name } = c.req.valid("json");

  const tenant = await db.transaction(async (tx) => {

    const [newTenant] = await tx
      .insert(tenants)
      .values({
        name
      })
      .returning();
    if (!newTenant) throw new Error("Tenant insertion failed");

    await tx
      .insert(tenantsUsers)
      .values({
        userId: payload.userId,
        tenantId: newTenant.id,
        role: "admin",
      });

    return newTenant;
  });

  return c.json(tenant, 201);
});

app.post("/tenants/users", zValidator("json", postTenantsUsersSchema), jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const { users } = c.req.valid("json");

  const isAdmin = await db.query.tenantsUsers.findFirst({
    where: and(
      eq(tenantsUsers.tenantId, payload.tenantId),
      eq(tenantsUsers.userId, payload.userId),
      eq(tenantsUsers.role, "admin"))
  })
  if (!isAdmin) throw new HTTPException(403, { message: "Access denied" });

  const tenantsUsersList = await db
    .insert(tenantsUsers)
    .values(users.map(({ userId, role }) => ({
      tenantId: payload.tenantId,
      userId: userId,
      role: role,
    })))
    .returning();

  return c.json(tenantsUsersList, 201);
});

export default app;
