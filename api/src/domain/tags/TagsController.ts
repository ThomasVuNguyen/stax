/** Port of domain/tags/TagsController (`/tags`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { NotFoundException } from "../../lib/errors";
import { jsonBody, queryEnum } from "../../lib/http";
import { TagTypeValues } from "../../enums/TagType";
import { MonitoringTypeValues } from "../../enums/MonitoringType";
import * as TagService from "./TagService";
import { newTagDTO } from "./dto/TagDTO";
import type { TagUpdateRequest } from "./dto/TagUpdateRequest";
import { type UserTagCreateRequest, validate as validateCreate } from "./dto/UserTagCreateRequest";

const app = new Hono<AppEnv>();

app.get("/tags", async (c) => {
  const ctx = ctxFromHono(c);
  const tagType = queryEnum(c, "tagType", TagTypeValues) ?? null;
  const type = queryEnum(c, "type", MonitoringTypeValues) ?? null;
  const result = await TagService.findTags(
    ctx,
    requireUser(ctx),
    tagType,
    c.req.query("projectId") ?? null,
    c.req.query("modelId") ?? null,
    type,
  );
  return c.json(result);
});

app.post("/tags", async (c) => {
  const ctx = ctxFromHono(c);
  const body = await jsonBody<UserTagCreateRequest>(c);
  validateCreate(body);
  const tag = await TagService.createUserTag(ctx, body.name as string, body.color ?? null, requireUser(ctx));
  c.header("Location", `/tags/${tag.id}`);
  return c.json(tag, 201);
});

app.get("/tags/:tagId", async (c) => {
  const ctx = ctxFromHono(c);
  const tag = await TagService.findByTagIdAndUser(ctx, c.req.param("tagId"), requireUser(ctx));
  if (!tag) throw new NotFoundException("Requested tag does not exist for this user");
  return c.json(newTagDTO(tag));
});

app.patch("/tags/:tagId", async (c) => {
  const ctx = ctxFromHono(c);
  const body = await jsonBody<TagUpdateRequest>(c);
  const updated = await TagService.updateUserTag(ctx, c.req.param("tagId"), requireUser(ctx), body.name, body.color);
  return c.json(updated);
});

app.delete("/tags/:tagNameOrId", async (c) => {
  const ctx = ctxFromHono(c);
  const deleted = await TagService.deleteByTagNameOrTagIdAndUser(ctx, c.req.param("tagNameOrId"), requireUser(ctx));
  return c.json({ message: `${deleted} tag is successfully deleted.` });
});

export default app;
