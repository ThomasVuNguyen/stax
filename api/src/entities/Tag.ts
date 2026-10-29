import { newId } from "../lib/db";
import type { TagType } from "../enums/TagType";
import * as TagTypeConverter from "../util/converter/TagTypeConverter";
import { type Param, type Row, num, str } from "./EntitySupport";

export const TABLE = "tag";
/** Primary key column is `tag_id` (not `id`). */
export const ID_COLUMN = "tag_id";
export const ID_PREFIX = "tag-";

export interface Tag {
  /** PK column tag_id, JSON "tag_id" */
  tagId: string | null;
  /** JSON "tag_name" */
  tagName: string | null;
  type: TagType | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  color: string | null;
  /** JSON "created_at" */
  createdAt: string | null;
  /** JSON "updated_at" */
  updatedAt: string | null;
  /** primitive int, default 0 */
  usedCount: number;
}

export const COLUMNS: Record<keyof Tag, string> = {
  tagId: "tag_id",
  tagName: "tag_name",
  type: "type",
  userId: "user_id",
  color: "color",
  createdAt: "created_at",
  updatedAt: "updated_at",
  usedCount: "used_count",
};

export function create(init: Partial<Tag> = {}): Tag {
  return {
    tagId: null,
    tagName: null,
    type: null,
    userId: null,
    color: null,
    createdAt: null,
    updatedAt: null,
    usedCount: 0,
    ...init,
  };
}

export function prePersist(e: Tag): void {
  if (e.tagId == null) e.tagId = newId(ID_PREFIX);
}

export function fromRow(row: Row): Tag {
  return {
    tagId: str(row.tag_id),
    tagName: str(row.tag_name),
    type: TagTypeConverter.convertToEntityAttribute(row.type),
    userId: str(row.user_id),
    color: str(row.color),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    usedCount: num(row.used_count) ?? 0,
  };
}

export function toRow(e: Tag): Record<string, Param> {
  return {
    tag_id: e.tagId,
    tag_name: e.tagName,
    type: TagTypeConverter.convertToDatabaseColumn(e.type),
    user_id: e.userId,
    color: e.color,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    used_count: e.usedCount ?? 0,
  };
}

/** Jackson names (@JsonProperty); callers add `user`. */
export function toJson(e: Tag): Record<string, unknown> {
  return {
    tag_id: e.tagId,
    tag_name: e.tagName,
    type: e.type,
    color: e.color,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    usedCount: e.usedCount,
  };
}
