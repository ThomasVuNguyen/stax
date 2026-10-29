import { RuntimeException } from "../lib/errors";

/**
 * Port of util/NumberUtil. The overloads of handleNullOrReturnDefault collapse into one generic
 * function. Also exports parseJavaInt / parseJavaDouble / parseJavaBoolean, which reproduce
 * Integer.valueOf(x.toString()) / Double.valueOf / Boolean.valueOf (used by the LLM strategies when
 * reading model properties); they throw RuntimeException("For input string: ...") like a
 * NumberFormatException reaching the RuntimeException handler.
 */

export function handleNullOrReturnDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return value === null || value === undefined ? defaultValue : value;
}

/** `new BigDecimal(Double.toString(value)).setScale(places, HALF_UP).doubleValue()`. */
export function round(value: number, places: number): number {
  if (places < 0) throw new RuntimeException("places must be >= 0");
  if (!Number.isFinite(value)) throw new RuntimeException(`For input string: "${value}"`);
  const [mant, expStr] = String(Math.abs(value)).split("e");
  const [intPart, frac = ""] = mant.split(".");
  let digits = intPart + frac;
  let point = intPart.length + (expStr ? Number(expStr) : 0);
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) digits += "0".repeat(point - digits.length);
  const keep = point + places;
  if (keep >= digits.length) return value;
  let n = BigInt(digits.slice(0, keep) || "0");
  if (digits.charCodeAt(keep) - 48 >= 5) n += 1n;
  const str = n.toString().padStart(places + 1, "0");
  const res = Number(str.slice(0, str.length - places) + (places ? "." + str.slice(str.length - places) : ""));
  return value < 0 && res !== 0 ? -res : res;
}

/** Integer.parseInt(value.trim()), null for blank or unparsable input. */
export function parseInteger(value: string | null | undefined): number | null {
  if (value === null || value === undefined || !value.trim()) return null;
  try {
    return parseJavaInt(value.trim());
  } catch {
    return null;
  }
}

function nfe(s: string): never {
  throw new RuntimeException(`For input string: "${s}"`);
}

/** Integer.valueOf(String.valueOf(v)): optional sign + digits, 32-bit range, no trimming. */
export function parseJavaInt(v: unknown): number {
  const s = String(v);
  if (!/^[+-]?\d+$/.test(s)) nfe(s);
  const n = Number(s);
  if (n > 2147483647 || n < -2147483648) nfe(s);
  return n;
}

/** Long.parseLong semantics (precision limited to doubles). */
export function parseJavaLong(v: unknown): number {
  const s = String(v);
  if (!/^[+-]?\d+$/.test(s)) nfe(s);
  return Number(s);
}

const JAVA_DOUBLE = /^[+-]?(NaN|Infinity|((\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[fFdD]?)$/;

/** Double.valueOf(String.valueOf(v)): trims, accepts NaN/Infinity, exponents and f/d suffixes. */
export function parseJavaDouble(v: unknown): number {
  const raw = String(v);
  const s = raw.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "");
  if (!JAVA_DOUBLE.test(s)) nfe(raw);
  return Number(s.replace(/[fFdD]$/, ""));
}

/** Boolean.valueOf(String.valueOf(v)). */
export function parseJavaBoolean(v: unknown): boolean {
  return String(v).toLowerCase() === "true";
}
