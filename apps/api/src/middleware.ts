import { jwt } from "hono/jwt"
import { config } from "../utils/config"

export const jwtMiddleware = jwt({
  secret: config.jwtSecret,
  alg: "HS256"
})
