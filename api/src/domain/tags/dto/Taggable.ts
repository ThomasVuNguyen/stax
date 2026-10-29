/**
 * Port of domain/tags/dto/Taggable. Java DTOs implementing it were discovered by class reflection
 * in TagResponseEnrichmentAdvice; plain JSON objects carry no class, so DTO factories mark them
 * with `markTaggable(dto, targetType, id)`. The marker is stored in non-enumerable properties: it
 * is invisible to JSON.stringify but lost by object spread (`{ ...dto }`), so mark the final object.
 *
 * Jackson also serialised the interface getter `getTagLinkTargetType()` as the JSON property
 * `"tagLinkTargetType"` on every Taggable DTO; markTaggable adds that (enumerable) property too.
 */
import type { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import type { TagDTO } from "./TagDTO";

const TYPE = "__tagLinkTargetType";
const ID = "__taggableId";

export interface Taggable {
  tags?: TagDTO[] | null;
  tagLinkTargetType?: TagLinkTargetType;
}

/** Marks `dto` as a Taggable of `targetType` whose `getId()` is `id`. Returns `dto`. */
export function markTaggable<T extends object>(dto: T, targetType: TagLinkTargetType, id: string | null): T {
  Object.defineProperty(dto, TYPE, { value: targetType, enumerable: false, configurable: true });
  Object.defineProperty(dto, ID, { value: id, enumerable: false, configurable: true });
  (dto as Taggable).tagLinkTargetType = targetType;
  return dto;
}

export function isTaggable(obj: unknown): obj is Taggable {
  return obj != null && typeof obj === "object" && TYPE in obj;
}

export function getTagLinkTargetType(obj: Taggable): TagLinkTargetType {
  return (obj as Record<string, unknown>)[TYPE] as TagLinkTargetType;
}

export function getId(obj: Taggable): string | null {
  return ((obj as Record<string, unknown>)[ID] as string | null) ?? null;
}

export function setTags(obj: Taggable, tags: TagDTO[]): void {
  obj.tags = tags;
}
