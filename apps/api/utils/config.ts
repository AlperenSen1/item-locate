import { z } from "zod";

const schema = z.object({
  jwtSecret: z.string().min(32),
  jwtExpiresInHours: z.coerce.number().default(24),
  databaseUrl: z.string(),
})

const raw = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresInHours: process.env.JWT_EXPIRES_IN_HOURS,
  databaseUrl: process.env.DATABASE_URL,
}

export const config = schema.parse(raw)
