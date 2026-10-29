/** Port of domain/tags/dto/TagLinkDTO. */
import type { TagLink } from "../../../entities/TagLink";
import type { TagLinkTargetType } from "../../../enums/TagLinkTargetType";

export interface TagLinkDTO {
  id: string | null;
  tag_id: string | null;
  target_entity: TagLinkTargetType | null;
  target_entity_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/** `new TagLinkDTO(tagLink)` (`tagLink.getTag().getTagId()` is the FK). */
export function newTagLinkDTO(tagLink: TagLink): TagLinkDTO {
  return {
    id: tagLink.id,
    tag_id: tagLink.tagId,
    target_entity: tagLink.targetType,
    target_entity_id: tagLink.targetId,
    created_at: tagLink.createdAt,
    updated_at: tagLink.updatedAt,
  };
}
