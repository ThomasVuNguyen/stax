/**
 * Request-body binding helpers for the model / apikeys / job packages (not a Java class).
 *
 * They reproduce what Jackson + Spring did before the controller ran: a missing body or a value
 * that cannot be bound to the declared Java type raised HttpMessageNotReadableException, which
 * GlobalExceptionHandler rendered through its RuntimeException handler as
 * `500 { error: "JSON parse error: ...", type: "RUNTIME_ERROR" }`. Jackson's scalar coercions
 * (number/boolean -> String, "true" -> Boolean, enum by ordinal) are honoured.
 */
import type { Context } from "hono";
import { RuntimeException } from "../../../lib/errors";
import { jsonBody } from "../../../lib/http";

function tokenDescription(v: unknown): string {
  if (Array.isArray(v)) return "Array value (token `JsonToken.START_ARRAY`)";
  switch (typeof v) {
    case "object":
      return "Object value (token `JsonToken.START_OBJECT`)";
    case "string":
      return "String value (token `JsonToken.VALUE_STRING`)";
    case "boolean":
      return `Boolean value (token \`JsonToken.VALUE_${v ? "TRUE" : "FALSE"}\`)`;
    case "number":
      return Number.isInteger(v)
        ? "Integer value (token `JsonToken.VALUE_NUMBER_INT`)"
        : "Floating-point value (token `JsonToken.VALUE_NUMBER_FLOAT`)";
    default:
      return "value";
  }
}

function parseError(javaType: string, v: unknown): never {
  throw new RuntimeException(`JSON parse error: Cannot deserialize value of type \`${javaType}\` from ${tokenDescription(v)}`);
}

/** A required `@RequestBody` object: empty body / `null` fail like Spring, malformed JSON like lib/http. */
export async function requiredJsonBody(c: Context, javaType: string): Promise<Record<string, unknown>> {
  const raw = await c.req.text();
  if (!raw.trim()) throw new RuntimeException("Required request body is missing");
  const body = await jsonBody<unknown>(c);
  if (body === null) throw new RuntimeException("Required request body is missing");
  if (typeof body !== "object" || Array.isArray(body)) parseError(javaType, body);
  return body as Record<string, unknown>;
}

export function bindString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return parseError("java.lang.String", v);
}

export function bindBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isInteger(v)) return v !== 0;
  if (typeof v === "string") {
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === "") return null;
    throw new RuntimeException(
      `JSON parse error: Cannot deserialize value of type \`java.lang.Boolean\` from String "${v}": only "true" or "false" recognized`,
    );
  }
  return parseError("java.lang.Boolean", v);
}

/** Enum binding (case-sensitive names, or an in-range ordinal). */
export function bindEnum<T extends string>(v: unknown, values: readonly T[], javaType: string): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    if (v === "") return null;
    if ((values as readonly string[]).includes(v)) return v as T;
    throw new RuntimeException(
      `JSON parse error: Cannot deserialize value of type \`${javaType}\` from String "${v}": not one of the values accepted for Enum class: [${values.join(", ")}]`,
    );
  }
  if (typeof v === "number" && Number.isInteger(v)) {
    if (v >= 0 && v < values.length) return values[v];
    throw new RuntimeException(
      `JSON parse error: Cannot deserialize value of type \`${javaType}\` from number ${v}: index value outside legal index range [0..${values.length - 1}]`,
    );
  }
  return parseError(javaType, v);
}

/** `Map<String, Object>`. */
export function bindObjectMap(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return parseError("java.util.LinkedHashMap<java.lang.String,java.lang.Object>", v);
}

/** `Map<String, String>` (scalar values coerced to strings, nulls kept). */
export function bindStringMap(v: unknown): Record<string, string> | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    return parseError("java.util.LinkedHashMap<java.lang.String,java.lang.String>", v);
  }
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = bindString(val) as string;
  return out;
}

/** `List<String>`. */
export function bindStringList(v: unknown): (string | null)[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return parseError("java.util.ArrayList<java.lang.String>", v);
  return v.map(bindString);
}

/** `String.valueOf(Object)` for values parsed from JSON (Java Map/List toString formats). */
export function javaToString(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(javaToString).join(", ")}]`;
  if (typeof v === "object") {
    return `{${Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}=${javaToString(val)}`)
      .join(", ")}}`;
  }
  return String(v);
}
