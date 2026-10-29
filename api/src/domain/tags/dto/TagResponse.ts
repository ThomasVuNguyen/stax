/**
 * Port of domain/tags/dto/TagResponse (@JsonInclude(NON_NULL), snake_case; `responseId` is
 * @JsonIgnore). Equality is by tagId (`equals`).
 */
import type { TagType } from "../../../enums/TagType";

export interface TagResponse {
  tag_id?: string;
  tag_name?: string;
  created_at?: string;
  updated_at?: string;
  color?: string;
  type?: TagType;
  used_count: number;
}

/** The three Java constructors; pass `responseId` only for the 8-argument one (it is not serialised). */
export function newTagResponse(
  tagId: string | null,
  tagName: string | null,
  color: string | null,
  type: TagType | null,
  createdAt: string | null,
  usedCount: number,
  updatedAt: string | null = null,
): TagResponse {
  const r: TagResponse = { used_count: usedCount };
  if (tagId != null) r.tag_id = tagId;
  if (tagName != null) r.tag_name = tagName;
  if (createdAt != null) r.created_at = createdAt;
  if (updatedAt != null) r.updated_at = updatedAt;
  if (color != null) r.color = color;
  if (type != null) r.type = type;
  return r;
}

export function equals(a: TagResponse | null | undefined, b: TagResponse | null | undefined): boolean {
  return !!a && !!b && a.tag_id === b.tag_id;
}
