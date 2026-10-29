/** Port of domain/tags/dto/TagLinksCreateRequest. */
import { InvalidDataException, RuntimeException } from "../../../lib/errors";
import { type TagLinkTargetType, TagLinkTargetTypeValues } from "../../../enums/TagLinkTargetType";

export interface TagLinksCreateRequest {
  tag_ids: string[];
  entity_type: TagLinkTargetType;
  entity_ids: string[];
}

/**
 * Binding + `@Validated`. Lombok `@NonNull` fields made Jackson fail while deserialising (an
 * HttpMessageNotReadableException, rendered by the generic handler as a 500); `@Size(min = 1)`
 * violations are MethodArgumentNotValidException field errors.
 */
export function validate(body: Record<string, unknown>): TagLinksCreateRequest {
  for (const [json, field] of [
    ["tag_ids", "tagIds"],
    ["entity_type", "entityType"],
    ["entity_ids", "entityIds"],
  ] as const) {
    if (body[json] === null || body[json] === undefined) {
      throw new RuntimeException(`JSON parse error: ${field} is marked non-null but is null`);
    }
  }
  if (!TagLinkTargetTypeValues.includes(body.entity_type as TagLinkTargetType)) {
    throw new RuntimeException(
      `JSON parse error: Cannot deserialize value of type \`TagLinkTargetType\` from String "${String(body.entity_type)}": not one of the values accepted for Enum class: [${TagLinkTargetTypeValues.join(", ")}]`,
    );
  }
  if (!Array.isArray(body.tag_ids) || !Array.isArray(body.entity_ids)) {
    throw new RuntimeException("JSON parse error: tag_ids and entity_ids must be arrays");
  }
  const errors: string[] = [];
  if (body.tag_ids.length < 1) errors.push("tagIds: Minimum of one tag is required");
  if (body.entity_ids.length < 1) errors.push("entityIds: Minimum of one target entity is required");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
  return body as unknown as TagLinksCreateRequest;
}
