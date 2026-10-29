import { InvalidDataException } from "../lib/errors";

/**
 * Port of @NoBlankListStrings / NoBlankListStringsValidator: null or empty list is valid; any
 * null/blank element is invalid. Field constraint -> InvalidDataException("<field>: <message>").
 */
export const NO_BLANK_LIST_STRINGS_DEFAULT_MESSAGE = "List contains blank strings";

export function isValidNoBlankListStrings(value: readonly (string | null | undefined)[] | null | undefined): boolean {
  if (!value || value.length === 0) return true;
  return value.every((s) => s !== null && s !== undefined && s.trim() !== "");
}

export function checkNoBlankListStrings(
  value: readonly (string | null | undefined)[] | null | undefined,
  field: string,
  message = NO_BLANK_LIST_STRINGS_DEFAULT_MESSAGE,
): string | null {
  return isValidNoBlankListStrings(value) ? null : `${field}: ${message}`;
}

export function validateNoBlankListStrings(
  value: readonly (string | null | undefined)[] | null | undefined,
  field: string,
  message = NO_BLANK_LIST_STRINGS_DEFAULT_MESSAGE,
): void {
  const err = checkNoBlankListStrings(value, field, message);
  if (err) throw new InvalidDataException(err);
}
