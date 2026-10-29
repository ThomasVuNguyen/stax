import { InvalidDataException } from "../lib/errors";

/**
 * Port of @ValidTimeRange / TimeRangeValidator (class-level constraint on objects with
 * startTime/endTime Instants). Invalid when the object or startTime is missing; a missing endTime
 * means "now"; startTime must be strictly before endTime. Accepts Date, ISO strings or epoch ms.
 * Class-level -> "<objectName>: <message>" (e.g. "userEvalMonitoringParams: ...").
 */
export const VALID_TIME_RANGE_DEFAULT_MESSAGE = "Start time must be before end time";

type Instant = Date | string | number | null | undefined;

function toMillis(v: Instant): number | null {
  if (v === null || v === undefined) return null;
  const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function isValidTimeRange(obj: { startTime?: Instant; endTime?: Instant } | null | undefined): boolean {
  if (!obj) return false;
  const start = toMillis(obj.startTime);
  if (start === null) return false;
  const end = toMillis(obj.endTime) ?? Date.now();
  return start < end;
}

export function checkTimeRange(
  obj: { startTime?: Instant; endTime?: Instant } | null | undefined,
  objectName: string,
  message = VALID_TIME_RANGE_DEFAULT_MESSAGE,
): string | null {
  return isValidTimeRange(obj) ? null : `${objectName}: ${message}`;
}

export function validateTimeRange(
  obj: { startTime?: Instant; endTime?: Instant } | null | undefined,
  objectName: string,
  message = VALID_TIME_RANGE_DEFAULT_MESSAGE,
): void {
  const err = checkTimeRange(obj, objectName, message);
  if (err) throw new InvalidDataException(err);
}
