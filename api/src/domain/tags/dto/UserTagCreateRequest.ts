/** Port of domain/tags/dto/UserTagCreateRequest (snake_case, NON_NULL). */
import { InvalidDataException } from "../../../lib/errors";

export interface UserTagCreateRequest {
  name?: string | null;
  color?: string | null;
}

/** `@Valid`: `@NotNull(message = "Tag name cannot be null") name`. */
export function validate(req: UserTagCreateRequest): void {
  if (req.name === null || req.name === undefined) throw new InvalidDataException("name: Tag name cannot be null");
}
