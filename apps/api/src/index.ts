import { Hono } from "hono";
import { jwt } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import type { AppVariables } from "./types.ts";
import authsApp from "./routes/auth.ts";
import containersApp from "./routes/containers.ts";
import itemsApp from "./routes/items.ts";
import tenantsApp from "./routes/tenants.ts"; //default exported şeyi import edeceksen parantez kullanamazsın
import usersApp from "./routes/users.ts";
import premisesApp from "./routes/premises.ts";


const app = new Hono<{ Variables: AppVariables }>();

//Global error handler for all routes
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

app.route("/", tenantsApp);
app.route("/", authsApp);
app.route("/", containersApp);
app.route("/", itemsApp);
app.route("/", usersApp);
app.route("/", premisesApp);


export default app;
