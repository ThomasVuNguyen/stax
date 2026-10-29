/** Port of domain/apikeys/ApiKeysController (`/api-keys`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import { rateLimit } from "../../lib/http";
import { requiredJsonBody } from "../model/dto/jsonBinding";
import * as ApiKeysRequestDTO from "./dto/ApiKeysRequestDTO";
import * as ApiKeysService from "./service/ApiKeysService";

const REQUEST_TYPE = "com.planck.planck.domain.apikeys.dto.ApiKeysRequestDTO";

const app = new Hono<AppEnv>();

app.get("/api-keys/get-keys-by-user", async (c) => {
  rateLimit(c, "getApiKeysByUser");
  return c.json(await ApiKeysService.getApiKeysStatus(ctxFromHono(c), currentUser(c)), 200);
});

app.post("/api-keys/set-key", async (c) => {
  // Body binding/validation ran before the @RateLimited aspect in Spring.
  const request = ApiKeysRequestDTO.fromJson(await requiredJsonBody(c, REQUEST_TYPE));
  ApiKeysRequestDTO.validate(request);
  rateLimit(c, "setKey");
  return c.json(await ApiKeysService.setApiKey(ctxFromHono(c), currentUser(c), request.provider, request.key), 200);
});

app.delete("/api-keys/delete-key", async (c) => {
  // Not @Validated in Java: a null provider fails inside the service.
  const request = ApiKeysRequestDTO.fromJson(await requiredJsonBody(c, REQUEST_TYPE));
  rateLimit(c, "deleteApiKeyByUser");
  return c.json(await ApiKeysService.deleteApiKey(ctxFromHono(c), currentUser(c), request.provider), 200);
});

export default app;
