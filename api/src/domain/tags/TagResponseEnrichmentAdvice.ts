/**
 * Port of domain/tags/TagResponseEnrichmentAdvice (a global ResponseBodyAdvice). Workers have no
 * response-body hook that still sees typed objects, so controllers call
 * `await beforeBodyWrite(ctx, body)` right before `c.json(body)` for every response whose Java
 * return type contained a Taggable DTO (ChatDTO, ChatTurnDTO, InferenceMonitoringDTO,
 * EvaluationMonitoringDTO, workbook rows…), or use `jsonWithTags(c, body, status)`.
 *
 * Taggables are recognised by the marker set with `tags/dto/Taggable.markTaggable`. As in Java:
 * - the walk stops at a Taggable (its nested Taggables are not enriched, e.g. the turns of a
 *   ChatDTO keep `tags: null`), recursing only through arrays and plain objects;
 * - every Taggable found gets `tags` set (an empty list when it has none);
 * - when at least one tag was found and the body has an `empty_columns` list, "tags" is removed
 *   from it.
 * Java's static type check skipped bodies whose declared type could not hold Taggables (e.g.
 * `Page<ChatTurnDTO>`, whose content type is erased); callers reproduce that by not calling this.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv } from "../../env";
import { type Ctx, ctxFromHono, requireUser } from "../../lib/ctx";
import type { TagLinkTargetType } from "../../enums/TagLinkTargetType";
import type { TagDTO } from "./dto/TagDTO";
import { type Taggable, getId, getTagLinkTargetType, isTaggable, setTags } from "./dto/Taggable";
import * as TagLinkService from "./TagLinkService";

function collectTaggables(obj: unknown, out: Taggable[], visited: Set<object>): void {
  if (obj === null || typeof obj !== "object" || visited.has(obj)) return;
  visited.add(obj);
  if (isTaggable(obj)) {
    out.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectTaggables(item, out, visited);
    return;
  }
  if (obj instanceof Map || obj instanceof Set) {
    // Java Maps/Sets are "java.*" classes: not traversed.
    return;
  }
  for (const value of Object.values(obj)) collectTaggables(value, out, visited);
}

export async function beforeBodyWrite<T>(ctx: Ctx, body: T): Promise<T> {
  if (body == null) return body;
  const taggables: Taggable[] = [];
  collectTaggables(body, taggables, new Set());
  if (!taggables.length) return body;

  const idsByType = new Map<TagLinkTargetType, string[]>();
  for (const t of taggables) {
    const type = getTagLinkTargetType(t);
    const list = idsByType.get(type) ?? [];
    list.push(getId(t) as string);
    idsByType.set(type, list);
  }

  const user = requireUser(ctx);
  const idToTags = new Map<string, TagDTO[]>();
  for (const [type, ids] of idsByType) {
    const tags = await TagLinkService.getUserTagsByTargetTypeAndEntityList(ctx, ids, type, user);
    for (const [id, list] of tags) idToTags.set(id, list);
  }

  let hasTags = false;
  for (const t of taggables) {
    const id = getId(t);
    const tags = (id != null && idToTags.get(id)) || [];
    setTags(t, tags);
    if (tags.length) hasTags = true;
  }

  if (hasTags && !Array.isArray(body) && typeof body === "object") {
    const emptyColumns = (body as Record<string, unknown>).empty_columns;
    if (Array.isArray(emptyColumns)) {
      const i = emptyColumns.indexOf("tags");
      if (i >= 0) emptyColumns.splice(i, 1);
    }
  }
  return body;
}

/** `c.json(body, status)` after tag enrichment. */
export async function jsonWithTags(c: Context<AppEnv>, body: unknown, status: ContentfulStatusCode = 200) {
  await beforeBodyWrite(ctxFromHono(c), body);
  return c.json(body as object, status);
}
