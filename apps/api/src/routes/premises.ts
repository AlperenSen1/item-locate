import { Hono } from "hono"
import { eq, and } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { zValidator } from "@hono/zod-validator"
import { db, premises } from "@item-locate/db"
import { type AppVariables } from "../types.ts"
import { jwtMiddleware } from "../middleware.ts"
import { idParamSchema, postPremiseSchema, patchPremiseSchema } from "@item-locate/types"
import { z } from "zod"

const app = new Hono<{ Variables: AppVariables }>()

app.get("/premises", jwtMiddleware, async (c) => {
  const { tenantId } = c.get("jwtPayload")
  const premiseList = await db.query.premises.findMany({
    where: eq(premises.tenantId, tenantId)
  })
  return c.json(premiseList)
})

app.post("/premises", zValidator("json", postPremiseSchema), jwtMiddleware, async (c) => {
  const { tenantId } = c.get("jwtPayload")
  const { name, location } = c.req.valid("json")
  const [premise] = await db
    .insert(premises)
    .values({ name, location, tenantId })
    .returning()
  return c.json(premise, 201)
})

app.get("/premises/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const { tenantId } = c.get("jwtPayload")
  const { id } = c.req.valid("param")
  const premise = await db.query.premises.findFirst({
    where: and(eq(premises.id, id), eq(premises.tenantId, tenantId))
  })
  if (!premise) throw new HTTPException(404, { message: "Not found" })
  return c.json(premise)
})

app.patch("/premises/:id", zValidator("param", idParamSchema), zValidator("json", patchPremiseSchema), jwtMiddleware, async (c) => {
  const { tenantId } = c.get("jwtPayload")
  const { id } = c.req.valid("param")
  const data = c.req.valid("json")

  const premise = await db.query.premises.findFirst({
    where: and(eq(premises.id, id), eq(premises.tenantId, tenantId))
  })
  if (!premise) throw new HTTPException(404, { message: "Not found" })

  const [updated] = await db
    .update(premises)
    .set(data)
    .where(eq(premises.id, id))
    .returning()

  return c.json(updated)
})

app.delete("/premises/:id", zValidator("param", idParamSchema), jwtMiddleware, async (c) => {
  const { tenantId } = c.get("jwtPayload")
  const { id } = c.req.valid("param")

  const premise = await db.query.premises.findFirst({
    where: and(eq(premises.id, id), eq(premises.tenantId, tenantId))
  })
  if (!premise) throw new HTTPException(404, { message: "Not found" })

  await db.delete(premises).where(eq(premises.id, id))

  return c.json({ message: "Deleted successfully" })
})

export default app
