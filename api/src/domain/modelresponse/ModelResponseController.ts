/** Port of domain/modelresponse/ModelResponseController (`/model-responses`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import * as ModelResponseService from "./service/ModelResponseService";
import { beforeBodyWrite } from "../tags/TagResponseEnrichmentAdvice";

const app = new Hono<AppEnv>();

app.get("/model-responses/:modelResponseId", async (c) => {
  const ctx = ctxFromHono(c);
  const dto = await ModelResponseService.getModelResponse(ctx, requireUser(ctx), c.req.param("modelResponseId"));
  // The nested inference_monitoring is a Taggable, so the Java advice enriched it.
  return c.json(await beforeBodyWrite(ctx, dto));
});

export default app;
