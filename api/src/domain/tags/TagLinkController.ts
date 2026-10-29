/** Port of domain/tags/TagLinkController (`/tag-links`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { IllegalInputException, RuntimeException } from "../../lib/errors";
import { jsonBody, queryEnum } from "../../lib/http";
import { type TagLinkTargetType, TagLinkTargetTypeValues } from "../../enums/TagLinkTargetType";
import * as TagLinkService from "./TagLinkService";
import { beforeBodyWrite } from "./TagResponseEnrichmentAdvice";
import { newTaggedEntitiesResponse } from "./dto/TaggedEntitiesResponse";
import { validate as validateCreateRequest } from "./dto/TagLinksCreateRequest";
import { type TagLinkRemoveRequest, validate as validateRemoveRequest } from "./dto/TagLinkRemoveRequest";

const app = new Hono<AppEnv>();

/** @PathVariable TagLinkTargetType binding (MethodArgumentTypeMismatchException format). */
function pathEnum(value: string, name: string): TagLinkTargetType {
  if (!TagLinkTargetTypeValues.includes(value as TagLinkTargetType)) {
    throw new IllegalInputException(
      `Invalid value '${value}' for parameter '${name}'. Allowed values are: [${TagLinkTargetTypeValues.join(", ")}]`,
    );
  }
  return value as TagLinkTargetType;
}

/** `@RequestBody List<String>`: anything but a JSON array fails binding (generic 500 handler). */
async function stringListBody(c: Parameters<typeof jsonBody>[0]): Promise<string[]> {
  const body = await jsonBody<unknown>(c);
  if (!Array.isArray(body)) {
    throw new RuntimeException("JSON parse error: Cannot deserialize value of type `java.util.ArrayList<java.lang.String>` from Object value");
  }
  return body as string[];
}

app.get("/tag-links/entities/by-tag/:tagId", async (c) => {
  const ctx = ctxFromHono(c);
  const entityType = queryEnum(c, "entityType", TagLinkTargetTypeValues) ?? null;
  const result = await TagLinkService.findHydratedEntitiesByTag(ctx, c.req.param("tagId"), requireUser(ctx), entityType);
  return c.json(await beforeBodyWrite(ctx, newTaggedEntitiesResponse(result)));
});

app.get("/tag-links/:entityType/:entityId", async (c) => {
  const ctx = ctxFromHono(c);
  const entityType = pathEnum(c.req.param("entityType"), "entityType");
  return c.json(await TagLinkService.getTagLinksDtoByEntity(ctx, entityType, c.req.param("entityId"), requireUser(ctx)));
});

app.get("/tag-links", async (c) => {
  const ctx = ctxFromHono(c);
  const entityType = queryEnum(c, "entityType", TagLinkTargetTypeValues) ?? null;
  return c.json(await TagLinkService.getTagLinks(ctx, requireUser(ctx), entityType));
});

app.post("/tag-links", async (c) => {
  const ctx = ctxFromHono(c);
  const request = validateCreateRequest(await jsonBody<Record<string, unknown>>(c));
  const result = await TagLinkService.createTagLinks(
    ctx,
    requireUser(ctx),
    request.tag_ids,
    request.entity_type,
    request.entity_ids,
  );
  c.header("Location", `/tag_links?entityType=${request.entity_type}`);
  return c.json(result, 201);
});

app.post("/tag-links/remove", async (c) => {
  const ctx = ctxFromHono(c);
  const request = validateRemoveRequest(await jsonBody<TagLinkRemoveRequest>(c));
  const deleted = await TagLinkService.removeTagLinks(
    ctx,
    requireUser(ctx),
    request.tag_ids ?? null,
    request.entity_ids ?? null,
    request.entity_type ?? null,
  );
  return c.json({ deleted });
});

app.post("/tag-links/remove/project/:projectId", async (c) => {
  const ctx = ctxFromHono(c);
  const tagIds = await stringListBody(c);
  const deleted = await TagLinkService.removeTagLinksForProject(ctx, requireUser(ctx), c.req.param("projectId"), tagIds);
  return c.json({ deleted });
});

// Registered before "/tag-links/:entityType/:entityId": Spring prefers the literal "project" segment.
app.post("/tag-links/project/:projectId", async (c) => {
  const ctx = ctxFromHono(c);
  const tagIds = await stringListBody(c);
  const result = await TagLinkService.createTagLinksForProject(ctx, requireUser(ctx), c.req.param("projectId"), tagIds);
  c.header("Location", "/tag_links?entityType=CHAT_TURN");
  return c.json(result, 201);
});

app.post("/tag-links/:entityType/:entityId", async (c) => {
  const ctx = ctxFromHono(c);
  const entityType = pathEnum(c.req.param("entityType"), "entityType");
  const tagId = c.req.query("tagId");
  if (tagId === undefined) {
    // MissingServletRequestParameterException → generic handler.
    throw new Error("Required request parameter 'tagId' for method parameter type String is not present");
  }
  const tagLink = await TagLinkService.createTagLink(ctx, entityType, c.req.param("entityId"), tagId, requireUser(ctx));
  c.header("Location", `/tag_links/${tagLink.id}`);
  return c.json(tagLink, 201);
});

app.delete("/tag-links/:id", async (c) => {
  const ctx = ctxFromHono(c);
  await TagLinkService.deleteTagLinkById(ctx, c.req.param("id"), requireUser(ctx));
  return c.body(null, 204);
});

export default app;
