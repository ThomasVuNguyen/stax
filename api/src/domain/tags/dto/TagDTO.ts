/** Port of domain/tags/dto/TagDTO (@JsonInclude(NON_NULL), snake_case). */
import type { Tag } from "../../../entities/Tag";
import type { TagType } from "../../../enums/TagType";

export interface TagDTO {
  id?: string;
  name?: string;
  type?: TagType;
  color?: string;
  created_at?: string;
  updated_at?: string;
  /** primitive int: always present */
  used_count: number;
}

/** `new TagDTO(tag)`; null fields are omitted like NON_NULL. */
export function newTagDTO(tag: Tag): TagDTO {
  const dto: TagDTO = { used_count: tag.usedCount ?? 0 };
  if (tag.tagId != null) dto.id = tag.tagId;
  if (tag.tagName != null) dto.name = tag.tagName;
  if (tag.type != null) dto.type = tag.type;
  if (tag.color != null) dto.color = tag.color;
  if (tag.createdAt != null) dto.created_at = tag.createdAt;
  if (tag.updatedAt != null) dto.updated_at = tag.updatedAt;
  return dto;
}
