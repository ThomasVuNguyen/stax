import { newId } from "../lib/db";
import type { TagLinkTargetType } from "../enums/TagLinkTargetType";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "tag_link";
export const ID_PREFIX = "tag-link-";

export interface TagLink {
  id: string | null;
  /** @ManyToOne Tag tag (tag_id) */
  tagId: string | null;
  targetId: string | null;
  /** Stored as the enum name in target_type (Java keeps a String field with enum accessors). */
  targetType: TagLinkTargetType | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** JSON "created_at" */
  createdAt: string | null;
  /** JSON "updated_at" */
  updatedAt: string | null;
}

export const COLUMNS: Record<keyof TagLink, string> = {
  id: "id",
  tagId: "tag_id",
  targetId: "target_id",
  targetType: "target_type",
  userId: "user_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<TagLink> = {}): TagLink {
  return { id: null, tagId: null, targetId: null, targetType: null, userId: null, createdAt: null, updatedAt: null, ...init };
}

export function prePersist(e: TagLink): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): TagLink {
  return {
    id: str(row.id),
    tagId: str(row.tag_id),
    targetId: str(row.target_id),
    targetType: str(row.target_type) as TagLinkTargetType | null,
    userId: str(row.user_id),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toRow(e: TagLink): Record<string, Param> {
  return {
    id: e.id,
    tag_id: e.tagId,
    target_id: e.targetId,
    target_type: e.targetType,
    user_id: e.userId,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/** Jackson view; callers add `tag` and `user`. */
export function toJson(e: TagLink): Record<string, unknown> {
  return {
    id: e.id,
    targetId: e.targetId,
    targetType: e.targetType,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

/** `equals()` compares ids only. */
export function equals(a: TagLink | null | undefined, b: TagLink | null | undefined): boolean {
  return !!a && !!b && a.id === b.id;
}
