/** Port of domain/tags/dto/TagLinkRemoveRequest. */
import { checkAtLeastOneField } from "../../../annotation/AtLeastOneFieldRequired";
import { InvalidDataException, RuntimeException } from "../../../lib/errors";
import { type TagLinkTargetType, TagLinkTargetTypeValues } from "../../../enums/TagLinkTargetType";

export interface TagLinkRemoveRequest {
  tag_ids?: string[] | null;
  entity_ids?: string[] | null;
  entity_type?: TagLinkTargetType | null;
}

/**
 * `@Validated`: `@Size(min = 1)` on entity_ids (field error) and the class-level
 * `@AtLeastOneFieldRequired(fields = {"tagIds", "entityIds"})` (global error). An unknown
 * entity_type fails JSON binding (generic 500 handler).
 */
export function validate(req: TagLinkRemoveRequest): TagLinkRemoveRequest {
  if (req.entity_type != null && !TagLinkTargetTypeValues.includes(req.entity_type)) {
    throw new RuntimeException(
      `JSON parse error: Cannot deserialize value of type \`TagLinkTargetType\` from String "${String(req.entity_type)}": not one of the values accepted for Enum class: [${TagLinkTargetTypeValues.join(", ")}]`,
    );
  }
  const errors: string[] = [];
  if (req.entity_ids != null && req.entity_ids.length < 1) {
    errors.push("entityIds: entity_ids must contain at least one element");
  }
  const global = checkAtLeastOneField(
    req,
    ["tag_ids", "entity_ids"],
    "tagLinkRemoveRequest",
    "Either tag_ids or entity_ids must be present",
  );
  if (global) errors.push(global);
  if (errors.length) throw new InvalidDataException(errors.join(", "));
  return req;
}
