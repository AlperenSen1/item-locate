import { z } from "zod";

const schema = z.object({
  jwtSecret: z.string().min(32),
  jwtExpiresInHours: z.coerce.number().default(24),
  databaseUrl: z.string(),
  googleApiKey: z.string(),
})

const raw = {
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresInHours: process.env.JWT_EXPIRES_IN_HOURS,
  databaseUrl: process.env.DATABASE_URL,
  googleApiKey: process.env.GOOGLE_API_KEY,
}

export const config = schema.parse(raw)
