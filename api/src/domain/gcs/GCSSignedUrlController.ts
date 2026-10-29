/** Port of domain/gcs/GCSSignedUrlController (`POST /datasets/uploadUrl`). See GCSSignedUrlService. */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { jsonBody } from "../../lib/http";
import type { GCSSignedUrlRequestDTO } from "./dto/GCSSignedUrlRequestDTO";
import * as GCSSignedUrlService from "./GCSSignedUrlService";

const app = new Hono<AppEnv>();

app.post("/datasets/uploadUrl", async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<GCSSignedUrlRequestDTO>(c);
  const response = await GCSSignedUrlService.generateSignedUrl(
    ctx,
    request.object_name ?? null,
    requireUser(ctx),
    request.input_column ?? null,
    request.output_column ?? null,
    request.expected_output_column ?? null,
  );
  return c.json(response, response.error != null ? 500 : 200);
});

export default app;
