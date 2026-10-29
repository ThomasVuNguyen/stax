/**
 * Spring's String → java.time.Instant conversion for request params (InstantFormatter): epoch
 * millis, RFC-1123 when the text starts with a letter, otherwise ISO-8601 instant (`Instant.parse`).
 * Returns null when the text cannot be parsed.
 */
const ISO_INSTANT = /^[+-]?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/i;

export function parseInstant(text: string): Date | null {
  let ms: number;
  if (/^-?\d+$/.test(text)) ms = Number(text);
  else if (/^[A-Za-z]/.test(text)) ms = Date.parse(text);
  else if (ISO_INSTANT.test(text)) ms = Date.parse(text);
  else return null;
  return Number.isNaN(ms) ? null : new Date(ms);
}
