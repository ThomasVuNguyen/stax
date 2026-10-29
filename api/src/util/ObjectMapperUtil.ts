import { RuntimeException } from "../lib/errors";

/**
 * Port of util/ObjectMapperUtil. Values are plain JS objects, so the Class<T> / TypeReference
 * arguments disappear (callers cast with the generic). Differences that come from Jackson:
 * - `toJsonStringNonNull` drops null/undefined object properties recursively (NON_NULL on beans;
 *   array elements are kept).
 * - Strings that are double-encoded JSON (`"\"{...}\""`, from H2 CSV seeding) are unwrapped by the
 *   list/map converters, as in Java.
 */

export function toJsonString(obj: unknown): string | null {
  try {
    return JSON.stringify(obj) ?? null;
  } catch {
    return null;
  }
}

export function toJsonStringNonNull(obj: unknown): string | null {
  try {
    return JSON.stringify(obj, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? stripNulls(v) : v)) ?? null;
  } catch {
    return null;
  }
}

function stripNulls(o: Record<string, unknown>): Record<string, unknown> {
  if (typeof (o as { toJSON?: unknown }).toJSON === "function") return o;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

export function convertMapToJsonString(map: Record<string, unknown> | null): string | null {
  try {
    return JSON.stringify(map) ?? null;
  } catch (e) {
    console.error("Error converting map to JSON string", e);
    return null;
  }
}

/** mapper.convertValue(f, clazz): a JSON round trip. */
export function convertObject<T>(f: unknown): T {
  return f === null || f === undefined ? (f as T) : (JSON.parse(JSON.stringify(f)) as T);
}

/** null (logged) when the string is not valid JSON. */
export function convertStringToObject<T>(jsonString: string): T | null {
  if (jsonString === null || jsonString === undefined) throw new RuntimeException("jsonString is null");
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    console.error("Error converting JSON string to object", e);
    return null;
  }
}

/** [] for blank input; throws RuntimeException for invalid JSON. */
export function convertJsonStringToList<T>(jsonString: string | null | undefined): T[] {
  if (jsonString === null || jsonString === undefined || !jsonString.trim()) return [];
  try {
    const v = JSON.parse(unescapeDoubleEncodedJson(jsonString));
    if (v === null) return null as unknown as T[];
    if (!Array.isArray(v)) throw new Error("not an array");
    return v as T[];
  } catch (e) {
    throw new RuntimeException("Error converting JSON string to list", { cause: e });
  }
}

/** {} for empty input or invalid JSON (logged). */
export function convertJsonStringToMap(jsonString: string | null | undefined): Record<string, any> {
  if (jsonString === null || jsonString === undefined || jsonString === "") return {};
  try {
    const v = JSON.parse(unescapeDoubleEncodedJson(jsonString));
    if (v === null) return null as unknown as Record<string, any>;
    if (typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v;
  } catch (e) {
    console.error("Error converting JSON string to map", e);
    return {};
  }
}

/** Distinct elements (by JSON value); [] for blank input, null on invalid JSON. */
export function convertJsonStringToSet<T>(jsonString: string | null | undefined): T[] | null {
  try {
    if (jsonString && jsonString.trim()) {
      const v = JSON.parse(jsonString);
      if (!Array.isArray(v)) throw new Error("not an array");
      const seen = new Set<string>();
      return v.filter((x) => {
        const k = JSON.stringify(x);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }) as T[];
    }
  } catch (e) {
    console.error(e);
    return null;
  }
  return [];
}

/** {} on any failure. Also covers the TypeReference overload `jsonToMap(json, typeRef)`. */
export function jsonToMap<T = any>(jsonString: string | null | undefined): Record<string, T> {
  try {
    const v = JSON.parse(jsonString as string);
    if (v === null) return null as unknown as Record<string, T>;
    if (typeof v !== "object" || Array.isArray(v)) throw new Error("not an object");
    return v;
  } catch (e) {
    console.error("Error converting JSON string to map", e);
    return {};
  }
}

export function jsonToMapString(jsonString: string | null | undefined): Record<string, string> {
  return jsonToMap<string>(jsonString);
}

/** [] on any failure. */
export function jsonToListOfMap(jsonString: string | null | undefined): Record<string, any>[] {
  try {
    const v = JSON.parse(jsonString as string);
    if (v === null) return null as unknown as Record<string, any>[];
    if (!Array.isArray(v)) throw new Error("not an array");
    return v;
  } catch (e) {
    console.error("Error converting JSON string to list of maps", e);
    return [];
  }
}

/** Array root -> its elements; any other root -> [root]; invalid JSON -> []. */
export function convetJsonStringToList<T = unknown>(jsonString: string): T[] {
  try {
    const v = JSON.parse(jsonString);
    return (Array.isArray(v) ? v : [v]) as T[];
  } catch (e) {
    console.error("Error converting JSON string to list", e);
    return [];
  }
}

/**
 * Throws for invalid JSON (null is accepted). Java threw java.lang.IllegalArgumentException, which
 * GlobalExceptionHandler renders through its RuntimeException handler.
 */
export function isValidJSON(jsonString: string | null | undefined): void {
  if (jsonString === null || jsonString === undefined) return;
  try {
    // Jackson's readTree accepts empty input (MissingNode).
    if (jsonString.trim()) JSON.parse(jsonString);
  } catch (e) {
    console.error("Error validating JSON string", e);
    throw new RuntimeException("Invalid JSON String");
  }
}

export function convertJsonStringToObject<T>(jsonString: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (e) {
    throw new RuntimeException("Error converting JSON string to object", { cause: e });
  }
}

export function convertObjectToJsonString(object: unknown): string {
  try {
    return JSON.stringify(object) ?? "null";
  } catch (e) {
    throw new RuntimeException("Error converting object to JSON string", { cause: e });
  }
}

function unescapeDoubleEncodedJson(jsonString: string): string {
  if (!jsonString.startsWith('"') || !jsonString.endsWith('"')) return jsonString;
  try {
    const v = JSON.parse(jsonString);
    return typeof v === "string" ? v : jsonString;
  } catch {
    return jsonString;
  }
}
