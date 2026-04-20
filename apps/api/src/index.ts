import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import tenantsApp from "./routes/tenants.ts"; //default exported şeyi import edeceksen parantez kullanamazsın
import authsApp from "./routes/auths.ts";


export type AppVariables = {
  jwtPayload: {
    userId: string;
    tenantId: string;
    role: string;
    exp: number;
  };
};

export const jwtMiddleware = jwt({
  secret: process.env.JWT_SECRET!,
  alg: "HS256"
});

const app = new Hono<{ Variables: AppVariables }>();

//Global error handler for all routes
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.route("/tenants", tenantsApp);
app.route("/auths", authsApp);

export default app;
