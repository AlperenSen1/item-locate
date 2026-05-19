import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { db } from "@item-locate/db";
import { users, tenants, tenantsUsers } from "@item-locate/db";
import { loginSchema, registerSchema } from "@item-locate/types";
import { type AppVariables } from "../types.ts";
import { jwtMiddleware } from "../middleware";
import { z } from "zod";
import { DateTime } from "luxon"
import { config } from "../../utils/config.ts"



const app = new Hono<{ Variables: AppVariables }>();


app.post("/register", zValidator("json", registerSchema), async (c) => {
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
app.post("/login", zValidator("json", loginSchema), async (c) => {

  const { email, password, tenantId } = c.req.valid("json");

  const user = await db.query.users.findFirst({
    where: eq(users.email, email)
  })

  const isValid = user && await Bun.password.verify(password, user.passwordHash); //user hiç yoksa verify hata fırlatabilirdi ama && önce solu kontrol ediyor, tehlikeli olabilir.
  if (!isValid) throw new HTTPException(401, { message: "Invalid Credentials" });

  if (tenantId) {
    const membership = await db.query.tenantsUsers.findFirst({
      where: and(eq(tenantsUsers.tenantId, tenantId), eq(tenantsUsers.userId, user.id))
    })
    if (!membership) throw new HTTPException(403, { message: "Access Denied" });

    const token = await sign({
      userId: user.id,
      tenantId,
      role: membership.role,
      exp: DateTime.now()
        .plus({ hours: config.jwtExpiresInHours })
        .toUnixInteger()
    },
      config.jwtSecret
    );
    return c.json({ token });
  }


  const tenantsUsersList = await db.query.tenantsUsers.findMany({
    where: eq(tenantsUsers.userId, user.id),
    with: {
      tenant: {
        columns: {
          id: true,
          name: true,
        }
      }
    }
  })
  const tenantList = tenantsUsersList.map(tu => tu.tenant)

  return c.json({ tenantList });
});


app.post("/token/refresh", zValidator("json", z.object({ tenantId: z.uuid() })), jwtMiddleware, async (c) => {

  const { tenantId } = c.req.valid("json");
  const payload = c.get("jwtPayload");

  const membership = await db.query.tenantsUsers.findFirst({
    where: and(eq(tenantsUsers.tenantId, tenantId), eq(tenantsUsers.userId, payload.userId))
  })
  if (!membership) throw new HTTPException(403, { message: "Access Denied" });

  const token = await sign({
    userId: payload.userId,
    tenantId,
    role: membership.role,
    exp: DateTime.now()
      .plus({ hours: config.jwtExpiresInHours })
      .toUnixInteger()
  },
  config.jwtSecret
  );
  return c.json({ token });
});


app.get("/me", jwtMiddleware, async (c) => {
  const payload = c.get("jwtPayload");
  const tenantsUser = await db.query.tenantsUsers.findFirst({
    where: and(eq(tenantsUsers.tenantId, payload.tenantId), eq(tenantsUsers.userId, payload.userId)),
    with: {
      user: {
        columns: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        }
      },
      tenant: {
        columns: {
          name: true
        }
      }
    }
  })
  const user = {
    ...tenantsUser?.user,
    tenantName: tenantsUser?.tenant.name,
    role: tenantsUser?.role,
  }

  return c.json({ user });
})


  export default app;
