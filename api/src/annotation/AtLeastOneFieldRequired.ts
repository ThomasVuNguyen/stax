import { InvalidDataException } from "../lib/errors";

/**
 * Port of @AtLeastOneFieldRequired / AtLeastOneFieldValidator (class-level constraint).
 * Valid when at least one of `fields` is non-null and, if it is an array, non-empty (strings count
 * even when empty). TS DTOs are keyed by JSON names, so pass the JSON keys (e.g. "tag_ids").
 * A class-level violation is a *global* error in MethodArgumentNotValidException, rendered as
 * "<objectName>: <message>" where objectName is the decapitalised DTO class name
 * (e.g. "tagLinkRemoveRequest").
 */
export const AT_LEAST_ONE_FIELD_DEFAULT_MESSAGE = "At least one of the listed fields must be provided";

export function isValidAtLeastOneField(obj: object | null | undefined, fields: readonly string[]): boolean {
  if (obj === null || obj === undefined) return false;
  const rec = obj as Record<string, unknown>;
  return fields.some((f) => {
    const v = rec[f];
    if (v === null || v === undefined) return false;
    if (Array.isArray(v) || v instanceof Set || v instanceof Map) {
      return (Array.isArray(v) ? v.length : v.size) > 0;
    }
    return true;
  });
}

export function checkAtLeastOneField(
  obj: object | null | undefined,
  fields: readonly string[],
  objectName: string,
  message = AT_LEAST_ONE_FIELD_DEFAULT_MESSAGE,
): string | null {
  return isValidAtLeastOneField(obj, fields) ? null : `${objectName}: ${message}`;
}

export function validateAtLeastOneField(
  obj: object | null | undefined,
  fields: readonly string[],
  objectName: string,
  message = AT_LEAST_ONE_FIELD_DEFAULT_MESSAGE,
): void {
  const err = checkAtLeastOneField(obj, fields, objectName, message);
  if (err) throw new InvalidDataException(err);
}
