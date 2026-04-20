import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "@item-locate/db";
import { users, tenants, tenantsUsers } from "@item-locate/db";
import { loginSchema, registerSchema } from "@item-locate/validators";
import { type AppVariables, jwtMiddleware } from "../index";
import { z } from "zod";



const app = new Hono<{ Variables: AppVariables }>();


// Register Route
app.post("/auth/register", zValidator("json", registerSchema), async (c) => {
  const { name, email, password } = c.req.valid("json");

  const passwordHash = await Bun.password.hash(password);

  await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        name,
        email,
        passwordHash,
      })
      .returning({ id: users.id });

    if (!newUser) throw new Error("User insertion failed");

    const [newTenant] = await tx
      .insert(tenants)
      .values({})
      .returning({ id: tenants.id });

    if (!newTenant) throw new Error("Tenant insertion failed");

    await tx.insert(tenantsUsers).values({
      tenantId: newTenant.id,
      userId: newUser.id,
      role: "admin",
    });
  });

  return c.json({ message: "Successfully registered" }, 201);
});

//Login Route
app.post("/auth/login", zValidator("json", loginSchema), async (c) => {

  const { email, password, tenantId } = c.req.valid("json");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email));

  const isValid = user && await Bun.password.verify(password, user.passwordHash); //user hiç yoksa verify hata fırlatabilirdi ama && önce solu kontrol ediyor, tehlikeli olabilir.
  if (!isValid) throw new HTTPException(401, { message: "Invalid Credentials" });

  if (tenantId) {
    const [membership] = await db
      .select()
      .from(tenantsUsers)
      .where(and(eq(tenantsUsers.tenantId, tenantId), eq(tenantsUsers.userId, user.id)));
    if (!membership) throw new HTTPException(403, { message: "Access Denied" });

    const token = await sign({
      userId: user.id,
      tenantId,
      role: membership.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
    },
      process.env.JWT_SECRET!
    );
    return c.json({ token });
  }

  const userTenants = await db
    .select({
      id: tenants.id,
      name: tenants.name,
    })
    .from(tenantsUsers)
    .innerJoin(tenants, eq(tenantsUsers.tenantId, tenants.id))
    .where(eq(tenantsUsers.userId, user.id));

  return c.json({ userTenants });
});


app.post("/auth/token/refresh", zValidator("json", z.object({ tenantId: z.uuid() })), jwtMiddleware, async (c) => {

  const { tenantId } = c.req.valid("json");

  const payload = c.get("jwtPayload");

  const token = await sign({
    userId: payload.userId,
    tenantId,
    role: payload.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
  },
    process.env.JWT_SECRET!
  );
  return c.json({ token });
});


export default app;
