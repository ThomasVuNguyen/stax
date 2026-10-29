/**
 * Port of domain/tags/TagService + TagServiceImpl. Entity parameters keep the Java order; `user`
 * only needs an id. `findByTagIdAndUser` returns `Tag | null` (Optional).
 */
import type { Ctx } from "../../lib/ctx";
import { IllegalArgumentException, IllegalInputException, NotFoundException, ResourceLimitExceedException } from "../../lib/errors";
import { type Tag, create as createTagEntity } from "../../entities/Tag";
import type { MonitoringType } from "../../enums/MonitoringType";
import { TagType } from "../../enums/TagType";
import { getMaxUserTags } from "../../config/ApplicationLimits";
import * as TagRepository from "./repository/TagRepository";
import * as TagLinkRepository from "./repository/TagLinkRepository";
import { type TagDTO, newTagDTO } from "./dto/TagDTO";
import type { TagFindResponse } from "./dto/TagFindResponse";

type UserRef = { id: string | null };
const uid = (user: UserRef): string => user.id as string;

export async function findByTagIdAndUser(ctx: Ctx, tagId: string, user: UserRef): Promise<Tag | null> {
  return TagRepository.findByTagIdAndUser(ctx.db, tagId, uid(user));
}

export async function createUserTag(ctx: Ctx, name: string, color: string | null, user: UserRef): Promise<TagDTO> {
  const currentTags = await TagRepository.countUserTags(ctx.db, uid(user));
  if (currentTags >= getMaxUserTags()) {
    throw new ResourceLimitExceedException(
      `Maximum allowed user tags ${getMaxUserTags()} exceeded, delete some and try again`,
    );
  }
  return newTagDTO(await createTag(ctx, name, TagType.USER, color, user));
}

export async function updateUserTag(
  ctx: Ctx,
  tagId: string,
  user: UserRef,
  name: string | null | undefined,
  color: string | null | undefined,
): Promise<TagDTO> {
  if (name == null && color == null) {
    throw new IllegalInputException("At least name or color must be provided for update");
  }
  const tag = await TagRepository.findByTagIdAndUser(ctx.db, tagId, uid(user));
  if (!tag) throw new NotFoundException("Tag with provided ID does not exist");
  if (tag.type !== TagType.USER) throw new IllegalInputException("Only user tags can be updated");
  if (name != null) {
    await checkTagNotExsits(ctx, null, name, TagType.USER, user);
    tag.tagName = name;
  }
  if (color != null) tag.color = color;
  return newTagDTO(await TagRepository.saveAndFlush(ctx.db, tag));
}

export async function findAllUserTags(ctx: Ctx, user: UserRef): Promise<Tag[]> {
  return TagRepository.findAllUserTags(ctx.db, uid(user));
}

export async function saveAll(ctx: Ctx, tags: Tag[]): Promise<Tag[]> {
  return TagRepository.saveAllAndFlush(ctx.db, tags);
}

export async function findTags(
  ctx: Ctx,
  user: UserRef,
  type: TagType | null,
  projectId: string | null,
  modelId: string | null,
  monitoringType: MonitoringType | null,
): Promise<TagFindResponse> {
  const result = await TagRepository.findWithFilters(ctx.db, uid(user), type, projectId, modelId, monitoringType);
  const response: TagFindResponse = { user_tags: [], model_tags: [], dataset_tags: [] };
  for (const tag of result) {
    const dto = newTagDTO(tag);
    if (tag.type === TagType.USER) response.user_tags!.push(dto);
    else if (tag.type === TagType.MODEL) response.model_tags!.push(dto);
    else if (tag.type === TagType.DATASET) response.dataset_tags!.push(dto);
  }
  return response;
}

export async function deleteByTagNameOrTagIdAndUser(ctx: Ctx, tagNameOrId: string, user: UserRef): Promise<number> {
  const tag = await TagRepository.findByIdOrNameAndUserId(ctx.db, tagNameOrId, uid(user));
  if (!tag) throw new NotFoundException(`tag: ${tagNameOrId} does not exist`);
  if (tag.type !== TagType.USER) throw new IllegalInputException("Only user tags can be deleted");
  await TagLinkRepository.deleteByTag(ctx.db, tag.tagId as string, uid(user));
  return TagRepository.deleteByUserAndTagId(ctx.db, uid(user), tag.tagId as string);
}

export async function findAllTagsByTagIdAndUser(ctx: Ctx, tagIds: Iterable<string>, user: UserRef): Promise<Tag[]> {
  return TagRepository.findAllTagsByTagIdsAndUser(ctx.db, [...new Set(tagIds)], uid(user));
}

async function createTag(ctx: Ctx, tagName: string, type: TagType, color: string | null, user: UserRef): Promise<Tag> {
  console.info(`Create tag tagName::${tagName}`);
  await checkTagNotExsits(ctx, null, tagName, type, user);
  const tag = createTagEntity({ tagName, type, userId: uid(user), color });
  return TagRepository.save(ctx.db, tag);
}

async function checkTagNotExsits(ctx: Ctx, tagId: string | null, tagName: string, type: TagType, user: UserRef) {
  if ((await TagRepository.countTagBy(ctx.db, tagId, tagName, type, uid(user))) > 0) {
    throw new IllegalArgumentException("A tag with the same name and type already exists for this user.");
  }
}
