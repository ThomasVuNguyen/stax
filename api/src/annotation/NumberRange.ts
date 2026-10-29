import { InvalidDataException } from "../lib/errors";
import { parseJavaDouble } from "../util/NumberUtil";

/**
 * Port of @NumberRange / NumberRangeValidator: the value is a *string* that must parse as a
 * double within [min, max]. null or unparsable -> invalid (Double.parseDouble threw).
 * As a field constraint it surfaced through MethodArgumentNotValidException ->
 * InvalidDataException("<field>: <message>").
 */
export const NUMBER_RANGE_DEFAULT_MESSAGE = "Value must be a numeric string between 0 and 1.";

export function isValidNumberRange(value: string | null | undefined, min = 0, max = 1): boolean {
  if (value === null || value === undefined) return false;
  try {
    const n = parseJavaDouble(value);
    return n >= min && n <= max;
  } catch {
    return false;
  }
}

/** `"<field>: <message>"` when invalid, null otherwise (for aggregating several violations). */
export function checkNumberRange(
  value: string | null | undefined,
  field: string,
  opts: { min?: number; max?: number; message?: string } = {},
): string | null {
  return isValidNumberRange(value, opts.min ?? 0, opts.max ?? 1)
    ? null
    : `${field}: ${opts.message ?? NUMBER_RANGE_DEFAULT_MESSAGE}`;
}

export function validateNumberRange(
  value: string | null | undefined,
  field: string,
  opts: { min?: number; max?: number; message?: string } = {},
): void {
  const err = checkNumberRange(value, field, opts);
  if (err) throw new InvalidDataException(err);
}
