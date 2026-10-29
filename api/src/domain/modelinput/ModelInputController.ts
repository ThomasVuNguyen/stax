/** Port of domain/modelinput/ModelInputController (`/model-input`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import * as ModelInputService from "./service/ModelInputService";

const app = new Hono<AppEnv>();

app.get("/model-input/:modelInputId", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ModelInputService.getModelInput(ctx, requireUser(ctx), c.req.param("modelInputId")));
});

export default app;
