/**
 * Port of domain/tags/dto/TagUpdateRequest. The @Length(max = 20) / @Pattern constraints are
 * declared but never enforced: the controller takes the body without @Valid.
 */
export interface TagUpdateRequest {
  name?: string | null;
  color?: string | null;
}
