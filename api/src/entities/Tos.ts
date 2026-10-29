import { bool, newId, toBool } from "../lib/db";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "tos";
export const ID_PREFIX = "tos-";

export interface Tos {
  id: string | null;
  content: string | null;
  type: string | null;
  contentType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isActive: boolean | null;
}

export const COLUMNS: Record<keyof Tos, string> = {
  id: "id",
  content: "content",
  type: "type",
  contentType: "content_type",
  createdAt: "created_at",
  updatedAt: "updated_at",
  isActive: "is_active",
};

export function create(init: Partial<Tos> = {}): Tos {
  return { id: null, content: null, type: null, contentType: null, createdAt: null, updatedAt: null, isActive: null, ...init };
}

/** Java `new Tos(content)`: active by default. */
export function createWithContent(content: string): Tos {
  return create({ content, isActive: true });
}

export function prePersist(e: Tos): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): Tos {
  return {
    id: str(row.id),
    content: str(row.content),
    type: str(row.type),
    contentType: str(row.content_type),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    isActive: toBool(row.is_active),
  };
}

export function toRow(e: Tos): Record<string, Param> {
  return {
    id: e.id,
    content: e.content,
    type: e.type,
    content_type: e.contentType,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    is_active: bool(e.isActive),
  };
}

export function toJson(e: Tos): Record<string, unknown> {
  return { ...e };
}
