/**
 * Port of domain/tags/TagLinkService + TagLinkServiceImpl.
 *
 * - `user` parameters only need an id; `Tag` relations of TagLink are the `tagId` FK, loaded with
 *   `TagLinkRepository.findTagsByTagLinks` where the Java code walked `link.getTag()`.
 * - JPA kept one managed Tag instance per id, so used-count changes made through different links
 *   accumulated on the same object; the functions below keep one Tag object per id for the same
 *   reason.
 * - `getUserTagsByTargetTypeAndEntityList` returns a `Map<entityId, TagDTO[]>`;
 *   `findHydratedEntitiesByTag` a `Map<TagLinkTargetType, unknown[]>` of DTOs (see
 *   repository/EntityFetcherRegistry).
 */
import type { Ctx } from "../../lib/ctx";
import {
  IllegalArgumentException,
  IllegalInputException,
  NotFoundException,
  ResourceAlreadyExistsException,
  ResourceLimitExceedException,
} from "../../lib/errors";
import type { Tag } from "../../entities/Tag";
import { type TagLink, create as createTagLinkEntity, fromRow as tagLinkFromRow } from "../../entities/TagLink";
import { first } from "../../lib/db";
import { TagLinkTargetType } from "../../enums/TagLinkTargetType";
import { TagType } from "../../enums/TagType";
import { getMaxTagsPerEntity } from "../../config/ApplicationLimits";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import * as TagRepository from "./repository/TagRepository";
import * as TagLinkRepository from "./repository/TagLinkRepository";
import * as EntityFetcherRegistry from "./repository/EntityFetcherRegistry";
import { type TagDTO, newTagDTO } from "./dto/TagDTO";
import { type TagLinkDTO, newTagLinkDTO } from "./dto/TagLinkDTO";

type UserRef = { id: string | null };
const uid = (user: UserRef): string => user.id as string;

const TAG_LIMIT_EXCEEDED_MESSAGE = (max: number, entities: Map<string, number>) =>
  `Tag limit of ${max} would be exceeded for entities: {${[...entities].map(([k, v]) => `${k}=${v}`).join(", ")}}`;

function dedupeById(links: TagLink[]): TagLink[] {
  return [...new Map(links.map((l) => [l.id, l])).values()];
}

export async function getTagLinks(ctx: Ctx, user: UserRef, targetType: TagLinkTargetType | null): Promise<TagLinkDTO[]> {
  const links =
    targetType != null
      ? await TagLinkRepository.findByTargetType(ctx.db, targetType, uid(user))
      : await TagLinkRepository.findAllByUser(ctx.db, uid(user));
  return links.map(newTagLinkDTO);
}

export async function getTagLinksDtoByEntity(
  ctx: Ctx,
  entityType: TagLinkTargetType,
  entityId: string,
  user: UserRef,
): Promise<TagLinkDTO[]> {
  return (await TagLinkRepository.findByTargetIdAndTargetType(ctx.db, entityId, entityType, uid(user))).map(newTagLinkDTO);
}

export async function getTagLinksByEntity(
  ctx: Ctx,
  entityType: TagLinkTargetType,
  entityId: string,
  user: UserRef,
): Promise<TagLink[]> {
  return TagLinkRepository.findByTargetIdAndTargetType(ctx.db, entityId, entityType, uid(user));
}

export async function getTagLinksByEntities(
  ctx: Ctx,
  entityType: TagLinkTargetType,
  entityIds: string[],
  user: UserRef,
): Promise<TagLink[]> {
  return TagLinkRepository.findByTargetIdsAndTargetType(ctx.db, entityIds, entityType, uid(user));
}

export async function findHydratedEntitiesByTag(
  ctx: Ctx,
  tagName: string,
  user: UserRef,
  targetType: TagLinkTargetType | null,
): Promise<Map<TagLinkTargetType, unknown[]>> {
  const tag = await TagRepository.findByTagIdAndUser(ctx.db, tagName, uid(user));
  if (!tag) throw new NotFoundException("User tag not found");

  const links =
    targetType != null
      ? await TagLinkRepository.findByTagAndTargetType(ctx.db, tag.tagId as string, targetType, uid(user))
      : await TagLinkRepository.findByTag(ctx.db, tag.tagId as string, uid(user));

  const groupedIds = new Map<TagLinkTargetType, string[]>();
  for (const link of links) {
    const type = link.targetType as TagLinkTargetType;
    const list = groupedIds.get(type) ?? [];
    list.push(link.targetId as string);
    groupedIds.set(type, list);
  }

  const result = new Map<TagLinkTargetType, unknown[]>();
  for (const [entityType, ids] of groupedIds) {
    const fetcher = EntityFetcherRegistry.getFetcher(entityType);
    if (fetcher) result.set(entityType, await fetcher.findAllByIds(ctx, ids, user));
  }
  return result;
}

export async function createTagLink(
  ctx: Ctx,
  entityType: TagLinkTargetType,
  entityId: string,
  tagId: string,
  user: UserRef,
): Promise<TagLinkDTO> {
  const tag = await TagRepository.findByTagIdAndUser(ctx.db, tagId, uid(user));
  await validateCreateLinkInput(ctx, tag, entityId, entityType, user);
  const found = tag as Tag;

  const tagLink = createTagLinkEntity({ userId: uid(user), targetId: entityId, targetType: entityType, tagId: found.tagId });
  found.usedCount = found.usedCount + 1;
  await TagRepository.save(ctx.db, found);

  const dto = newTagLinkDTO(await TagLinkRepository.save(ctx.db, tagLink));
  await cascadeCreateLinks(ctx, entityType, [entityId], [found], user);
  return dto;
}

export async function createTagLinks(
  ctx: Ctx,
  user: UserRef,
  tagIds: string[],
  entityType: TagLinkTargetType,
  entityIds: string[],
): Promise<TagLinkDTO[]> {
  const filteredTags = await getUserTags(ctx, tagIds, user);
  const newTagsPerEntity = await validateCreateLinksInput(ctx, entityIds, entityType, user, filteredTags);
  if (!newTagsPerEntity.size) return [];

  const tagLinks: TagLink[] = [];
  for (const [entityId, tags] of newTagsPerEntity) {
    for (const tag of tags) {
      tag.usedCount = tag.usedCount + 1;
      tagLinks.push(createTagLinkEntity({ tagId: tag.tagId, targetId: entityId, targetType: entityType, userId: uid(user) }));
    }
  }
  const tagById = new Map(filteredTags.map((t) => [t.tagId, t]));
  await TagRepository.saveAll(ctx.db, [...new Set(tagLinks.map((l) => tagById.get(l.tagId) as Tag))]);

  const result = (await TagLinkRepository.saveAll(ctx.db, tagLinks)).map(newTagLinkDTO);
  await cascadeCreateLinks(ctx, entityType, entityIds, filteredTags, user);
  return result;
}

export async function saveAll(ctx: Ctx, tags: TagLink[]): Promise<TagLink[]> {
  return TagLinkRepository.saveAllAndFlush(ctx.db, tags);
}

export async function deleteTagLinkById(ctx: Ctx, id: string, user: UserRef): Promise<void> {
  // Inherited findById: not scoped by user.
  const row = await first(ctx.db, `SELECT * FROM tag_link WHERE id = ?`, id);
  if (!row) throw new NotFoundException("Tag link not found");
  const tagLink = tagLinkFromRow(row);

  const toDelete = new Map<string | null, TagLink>([[tagLink.id, tagLink]]);
  await cascadeDeleteLinks(ctx, tagLink.targetType, [tagLink.targetId as string], [tagLink.tagId as string], user, toDelete);

  const tags = await TagLinkRepository.findTagsByTagLinks(ctx.db, [...toDelete.values()]);
  // Java decremented `tagLink.getTag()` once here and again in updateTagUsedCountOnDelete.
  const directTag = tags.get(tagLink.tagId as string);
  if (directTag) directTag.usedCount = directTag.usedCount - 1;

  await updateTagUsedCountOnDelete(ctx, [...toDelete.values()], tags);
  await TagLinkRepository.deleteAll(ctx.db, [...toDelete.values()]);
}

export async function removeTagLinks(
  ctx: Ctx,
  user: UserRef,
  tagIds: string[] | null,
  entityIds: string[] | null,
  entityType: TagLinkTargetType | null,
): Promise<number> {
  if (entityIds != null && entityType == null) {
    throw new IllegalInputException("Target type is required when using target_ids");
  }
  const toDelete = new Map<string | null, TagLink>();
  for (const l of await TagLinkRepository.findByTargetOrTag(ctx.db, entityIds, entityType, tagIds, uid(user))) {
    toDelete.set(l.id, l);
  }
  await cascadeDeleteLinks(ctx, entityType, entityIds, tagIds, user, toDelete);

  const links = [...toDelete.values()];
  await updateTagUsedCountOnDelete(ctx, links, await TagLinkRepository.findTagsByTagLinks(ctx.db, links));
  if (links.length) {
    await TagLinkRepository.deleteByIdsAndUser(ctx.db, links.map((l) => l.id as string), uid(user));
  }
  return links.length;
}

async function updateTagUsedCountOnDelete(ctx: Ctx, toDelete: TagLink[], tags: Map<string, Tag>): Promise<void> {
  const counts = new Map<string, number>();
  for (const l of toDelete) {
    if (l.tagId != null) counts.set(l.tagId, (counts.get(l.tagId) ?? 0) + 1);
  }
  const touched: Tag[] = [];
  for (const [tagId, count] of counts) {
    const tag = tags.get(tagId);
    if (!tag) continue;
    tag.usedCount = Math.max(0, tag.usedCount - count);
    touched.push(tag);
  }
  if (touched.length) await TagRepository.saveAll(ctx.db, touched);
}

export async function getUserTagsByTargetTypeAndEntityList(
  ctx: Ctx,
  entityIds: string[] | null,
  entityType: TagLinkTargetType | null,
  user: UserRef | null,
): Promise<Map<string, TagDTO[]>> {
  if (entityIds == null || !entityIds.length) return new Map();
  if (entityType == null || user == null) {
    throw new IllegalArgumentException("Entity type and user cannot be null");
  }
  const rawTagLinks = await TagLinkRepository.findTargetIdAndTagIdByTargetIdsAndTypeAndUser(
    ctx.db,
    entityIds,
    entityType,
    uid(user),
  );
  if (!rawTagLinks.length) return new Map();

  const tagsByTargetId = new Map<string, string[]>();
  const allTagIds = new Set<string>();
  for (const [targetId, tagId] of rawTagLinks) {
    allTagIds.add(tagId);
    const list = tagsByTargetId.get(targetId) ?? [];
    list.push(tagId);
    tagsByTargetId.set(targetId, list);
  }

  const tagById = new Map(
    (await TagRepository.findAllById(ctx.db, [...allTagIds])).map((t) => [t.tagId, newTagDTO(t)] as const),
  );
  const result = new Map<string, TagDTO[]>();
  for (const [targetId, tagIds] of tagsByTargetId) {
    result.set(
      targetId,
      tagIds.map((id) => tagById.get(id)).filter((t): t is TagDTO => t != null),
    );
  }
  return result;
}

async function syncMonitoringTags(
  ctx: Ctx,
  monitoringId: string,
  user: UserRef,
  targetType: TagLinkTargetType,
): Promise<void> {
  // Both Java methods look the tags up through findTagsForEvaluationMonitoring.
  const missingTags = await TagLinkRepository.findTagsForEvaluationMonitoring(ctx.db, monitoringId, uid(user));
  const newLinks = missingTags.map((tag) =>
    createTagLinkEntity({ tagId: tag.tagId, targetType, targetId: monitoringId, userId: uid(user) }),
  );
  if (newLinks.length) await TagLinkRepository.saveAll(ctx.db, newLinks);
}

export async function syncEvaluationMonitoringTags(ctx: Ctx, evaluationMonitoringId: string, user: UserRef): Promise<void> {
  await syncMonitoringTags(ctx, evaluationMonitoringId, user, TagLinkTargetType.EVALUATION_MONITORING);
}

export async function syncInferenceMonitoringTags(ctx: Ctx, inferenceMonitoringId: string, user: UserRef): Promise<void> {
  await syncMonitoringTags(ctx, inferenceMonitoringId, user, TagLinkTargetType.INFERENCE_MONITORING);
}

export async function getUserTags(ctx: Ctx, tagIds: string[], user: UserRef): Promise<Tag[]> {
  const tags = await TagRepository.findAllTagsByTagIdsAndUser(ctx.db, [...new Set(tagIds)], uid(user));
  return tags.filter((t) => t.type === TagType.USER);
}

async function validateCreateLinksInput(
  ctx: Ctx,
  entityIds: string[],
  entityType: TagLinkTargetType,
  user: UserRef,
  filteredTags: Tag[],
): Promise<Map<string, Tag[]>> {
  if (!filteredTags.length) throw new IllegalInputException("No user tags found");

  const existingLinks = await TagLinkRepository.findTargetIdAndTagIdByTargetIdsAndTypeAndUser(
    ctx.db,
    entityIds,
    entityType,
    uid(user),
  );
  const existingTagMap = new Map<string, Set<string>>();
  for (const [targetId, tagId] of existingLinks) {
    const set = existingTagMap.get(targetId) ?? new Set<string>();
    set.add(tagId);
    existingTagMap.set(targetId, set);
  }

  const newTagsPerEntity = new Map<string, Tag[]>();
  const exceeding = new Map<string, number>();
  const max = getMaxTagsPerEntity();
  for (const entityId of entityIds) {
    const existing = existingTagMap.get(entityId) ?? new Set<string>();
    const newTags = filteredTags.filter((t) => !existing.has(t.tagId as string));
    const total = existing.size + newTags.length;
    if (total > max) exceeding.set(entityId, total);
    if (newTags.length) newTagsPerEntity.set(entityId, newTags);
  }
  if (exceeding.size) throw new ResourceLimitExceedException(TAG_LIMIT_EXCEEDED_MESSAGE(max, exceeding));
  return newTagsPerEntity;
}

async function validateCreateLinkInput(
  ctx: Ctx,
  tag: Tag | null,
  entityId: string,
  entityType: TagLinkTargetType,
  user: UserRef,
): Promise<void> {
  if (!tag) throw new NotFoundException("User tag not found");
  const existingLinks = await TagLinkRepository.findByTargetIdAndTargetType(ctx.db, entityId, entityType, uid(user));
  if (existingLinks.some((l) => l.tagId === tag.tagId)) {
    throw new ResourceAlreadyExistsException("Tag link already exists");
  }
  if (existingLinks.length + 1 > getMaxTagsPerEntity()) {
    throw new IllegalInputException(
      `Operation would result in exceeding the tags per entity limit of ${getMaxTagsPerEntity()}`,
    );
  }
}

export async function createTagLinksForProject(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  tagIds: string[],
): Promise<TagLinkDTO[]> {
  const chatTurnIds = await ChatTurnRepository.findChatTurnIdsByContainerId(ctx.db, projectId, uid(user));
  return createTagLinks(ctx, user, tagIds, TagLinkTargetType.CHAT_TURN, chatTurnIds);
}

export async function removeTagLinksForProject(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  tagIds: string[] | null,
): Promise<number> {
  const chatTurnIds = await ChatTurnRepository.findChatTurnIdsByContainerId(ctx.db, projectId, uid(user));
  const ids = tagIds != null && !tagIds.length ? null : tagIds;
  return removeTagLinks(ctx, user, ids, chatTurnIds, TagLinkTargetType.CHAT_TURN);
}

async function cascadeCreateLinks(
  ctx: Ctx,
  parentType: TagLinkTargetType,
  parentIds: string[],
  tags: Tag[],
  user: UserRef,
): Promise<void> {
  if (!parentIds?.length) return;
  if (parentType === TagLinkTargetType.CHAT) {
    const chatTurnIds = (await ChatTurnRepository.findChatTurnsByChatList(ctx.db, parentIds, uid(user))).map(
      (t) => t.id as string,
    );
    await createLinksForTargets(ctx, chatTurnIds, TagLinkTargetType.CHAT_TURN, tags, user);
    await cascadeCreateLinks(ctx, TagLinkTargetType.CHAT_TURN, chatTurnIds, tags, user);
  } else if (parentType === TagLinkTargetType.CHAT_TURN) {
    const evalIds = await TagLinkRepository.findEvaluationMonitoringIdsByChatTurnIds(ctx.db, parentIds, uid(user));
    await createLinksForTargets(ctx, evalIds, TagLinkTargetType.EVALUATION_MONITORING, tags, user);
    const inferIds = await TagLinkRepository.findInferenceMonitoringIdsByChatTurnIds(ctx.db, parentIds, uid(user));
    await createLinksForTargets(ctx, inferIds, TagLinkTargetType.INFERENCE_MONITORING, tags, user);
  }
}

async function createLinksForTargets(
  ctx: Ctx,
  entityIds: string[],
  entityType: TagLinkTargetType,
  tagsToApply: Tag[],
  user: UserRef,
): Promise<TagLink[]> {
  if (!entityIds?.length || !tagsToApply?.length) return [];
  const existingLinks = await TagLinkRepository.findByTargetIdsAndTargetType(ctx.db, entityIds, entityType, uid(user));
  const existing = new Map<string, Set<string>>();
  for (const l of existingLinks) {
    const set = existing.get(l.targetId as string) ?? new Set<string>();
    set.add(l.tagId as string);
    existing.set(l.targetId as string, set);
  }
  const newLinks: TagLink[] = [];
  // Java iterates the (possibly duplicated) id list, so a duplicated id gets duplicate links.
  for (const entityId of entityIds) {
    const existingTagIds = existing.get(entityId) ?? new Set<string>();
    for (const tag of tagsToApply) {
      if (!existingTagIds.has(tag.tagId as string)) {
        newLinks.push(createTagLinkEntity({ tagId: tag.tagId, targetId: entityId, targetType: entityType, userId: uid(user) }));
        tag.usedCount = tag.usedCount + 1;
      }
    }
  }
  if (!newLinks.length) return [];
  const byId = new Map(tagsToApply.map((t) => [t.tagId, t]));
  await TagRepository.saveAll(ctx.db, [...new Set(newLinks.map((l) => byId.get(l.tagId) as Tag))]);
  return TagLinkRepository.saveAll(ctx.db, newLinks);
}

async function cascadeDeleteLinks(
  ctx: Ctx,
  parentType: TagLinkTargetType | null,
  parentIds: string[] | null,
  tagIds: string[] | null,
  user: UserRef,
  toDelete: Map<string | null, TagLink>,
): Promise<void> {
  if (!parentIds?.length || parentType == null) return;
  const add = (links: TagLink[]) => dedupeById(links).forEach((l) => toDelete.set(l.id, l));
  if (parentType === TagLinkTargetType.CHAT) {
    const chatTurnIds = (await ChatTurnRepository.findChatTurnsByChatList(ctx.db, parentIds, uid(user))).map(
      (t) => t.id as string,
    );
    if (chatTurnIds.length) {
      add(await TagLinkRepository.findByTargetOrTag(ctx.db, chatTurnIds, TagLinkTargetType.CHAT_TURN, tagIds, uid(user)));
      await cascadeDeleteLinks(ctx, TagLinkTargetType.CHAT_TURN, chatTurnIds, tagIds, user, toDelete);
    }
  } else if (parentType === TagLinkTargetType.CHAT_TURN) {
    add(await TagLinkRepository.findEvaluationTagLinksByChatTurnIdsAndTagIds(ctx.db, parentIds, tagIds, uid(user)));
    add(await TagLinkRepository.findInferenceTagLinksByChatTurnIds(ctx.db, parentIds, tagIds, uid(user)));
  }
}

export async function updateTagsForEntity(
  ctx: Ctx,
  user: UserRef,
  newTagIds: string[],
  entityType: TagLinkTargetType,
  entityId: string,
): Promise<void> {
  const existingLinks = await TagLinkRepository.findByTargetIdAndTargetType(ctx.db, entityId, entityType, uid(user));
  const existingTagIds = new Set(existingLinks.map((l) => l.tagId as string));
  const newSet = new Set(newTagIds);

  const idsToRemove = [...existingTagIds].filter((id) => !newSet.has(id));
  if (idsToRemove.length) await removeTagLinks(ctx, user, idsToRemove, [entityId], entityType);

  const idsToAdd = [...newSet].filter((id) => !existingTagIds.has(id));
  if (idsToAdd.length) await createTagLinks(ctx, user, idsToAdd, entityType, [entityId]);
}
