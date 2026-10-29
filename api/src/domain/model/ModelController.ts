/** Port of domain/model/ModelController (`/model`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ModelProviderValue, ModelProviderValues } from "../../enums/ModelProvider";
import { MonitoringTypeValues } from "../../enums/MonitoringType";
import { currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import { queryEnum } from "../../lib/http";
import * as CustomEndpointRegistrationRequest from "./dto/CustomEndpointRegistrationRequest";
import * as CustomEndpointRegistrationResponse from "./dto/CustomEndpointRegistrationResponse";
import * as ModelUpdateRequest from "./dto/ModelUpdateRequest";
import * as NewModelRegistrationWithCustomProperitesRequest from "./dto/NewModelRegistrationWithCustomProperitesRequest";
import { requiredJsonBody } from "./dto/jsonBinding";
import * as ModelService from "./service/ModelService";

const DTO = "com.planck.planck.domain.model.dto.";

const app = new Hono<AppEnv>();

app.get("/model/list", async (c) => {
  const type = queryEnum(c, "type", MonitoringTypeValues) ?? null;
  const projectId = c.req.query("projectId") ?? null;
  return c.json(await ModelService.getModelsList(ctxFromHono(c), currentUser(c), projectId, type), 200);
});

app.get("/model/providers", (c) => {
  const out: Record<string, string> = {};
  for (const p of ModelProviderValues) out[p] = ModelProviderValue[p];
  return c.json(out, 200);
});

app.post("/model/custom-endpoint", async (c) => {
  const request = CustomEndpointRegistrationRequest.fromJson(
    await requiredJsonBody(c, DTO + "CustomEndpointRegistrationRequest"),
  );
  CustomEndpointRegistrationRequest.validate(request);
  const model = await ModelService.registerCustomEndpoint(ctxFromHono(c), request, currentUser(c));
  return c.json(CustomEndpointRegistrationResponse.fromModel(model), 200);
});

app.patch("/model/deprecate/:modelId", async (c) => {
  return c.json(await ModelService.deprecateModel(ctxFromHono(c), c.req.param("modelId"), currentUser(c)), 200);
});

app.patch("/model/:modelId", async (c) => {
  const r = ModelUpdateRequest.fromJson(await requiredJsonBody(c, DTO + "ModelUpdateRequest"));
  const dto = await ModelService.updateModel(
    ctxFromHono(c),
    c.req.param("modelId"),
    currentUser(c),
    r.label,
    r.description,
    r.comments,
    r.descriptors,
    r.api_key,
    r.url,
    r.additional_headers,
  );
  return c.json(dto, 200);
});

app.post("/model/:modelId/duplicate-and-modify", async (c) => {
  const request = NewModelRegistrationWithCustomProperitesRequest.fromJson(
    await requiredJsonBody(c, DTO + "NewModelRegistrationWithCustomProperitesRequest"),
  );
  const dto = await ModelService.registerNewModelWithCustomProperties(
    ctxFromHono(c),
    request,
    c.req.param("modelId"),
    currentUser(c),
  );
  return c.json(dto, 200);
});

export default app;
