/**
 * Port of domain/model/dto/ModelPropertyDescriptor. The Java class had no naming annotations, so
 * the JSON (and the `descriptors` column written by duplicate-and-modify) uses camelCase.
 *
 * - `fromJson(value)` binds a request value like Jackson did (type must be an exact PropertyType
 *   name, scalar coercion for strings/booleans, failures -> 500 "JSON parse error: ...").
 * - `toJson(d)` is what Jackson wrote: the fields plus the `comparableMinValue` /
 *   `comparableMaxValue` getters.
 * - `toMap(d)` is the Java `toMap()` (snake_case keys, lower-case type).
 */
import { bindBoolean, bindEnum, bindString } from "./jsonBinding";
import { RuntimeException } from "../../../lib/errors";

export const PropertyType = {
  DOUBLE: "DOUBLE",
  INTEGER: "INTEGER",
  STRING: "STRING",
  BOOLEAN: "BOOLEAN",
  STRING_ARRAY: "STRING_ARRAY",
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];
export const PropertyTypeValues: PropertyType[] = ["DOUBLE", "INTEGER", "STRING", "BOOLEAN", "STRING_ARRAY"];

/** `PropertyType.getName()`. */
export function getName(t: PropertyType): string {
  return t.toLowerCase();
}

export interface ModelPropertyDescriptor {
  key: string | null;
  type: PropertyType | null;
  defaultValue: unknown;
  minValue: unknown;
  maxValue: unknown;
  editable: boolean | null;
  label: string | null;
  description: string | null;
}

export function create(
  key: string | null,
  type: PropertyType | null,
  defaultValue: unknown,
  minValue: unknown,
  maxValue: unknown,
  editable: boolean,
  label: string | null,
  description: string | null,
): ModelPropertyDescriptor {
  return { key, type, defaultValue, minValue, maxValue, editable, label, description };
}

/** Jackson deserialisation of one descriptor (null stays null; unknown properties are ignored). */
export function fromJson(v: unknown): ModelPropertyDescriptor | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object" || Array.isArray(v)) {
    const what = Array.isArray(v) ? "Array value (token `JsonToken.START_ARRAY`)" : `${typeof v} value`;
    throw new RuntimeException(
      `JSON parse error: Cannot construct instance of \`com.planck.planck.domain.model.dto.ModelPropertyDescriptor\` from ${what}`,
    );
  }
  const o = v as Record<string, unknown>;
  return {
    key: bindString(o.key),
    type: bindEnum(o.type, PropertyTypeValues, "com.planck.planck.domain.model.dto.ModelPropertyDescriptor$PropertyType"),
    defaultValue: o.defaultValue ?? null,
    minValue: o.minValue ?? null,
    maxValue: o.maxValue ?? null,
    editable: bindBoolean(o.editable),
    label: bindString(o.label),
    description: bindString(o.description),
  };
}

/** `instanceof Comparable`: JSON scalars are (String/Number/Boolean), maps and lists are not. */
function comparable(v: unknown): unknown {
  return v !== null && typeof v !== "object" ? v : null;
}

export function getComparableMinValue(d: ModelPropertyDescriptor): unknown {
  return comparable(d.minValue);
}

export function getComparableMaxValue(d: ModelPropertyDescriptor): unknown {
  return comparable(d.maxValue);
}

export function toJson(d: ModelPropertyDescriptor): Record<string, unknown> {
  return {
    key: d.key,
    type: d.type,
    defaultValue: d.defaultValue,
    minValue: d.minValue,
    maxValue: d.maxValue,
    editable: d.editable,
    label: d.label,
    description: d.description,
    comparableMinValue: getComparableMinValue(d),
    comparableMaxValue: getComparableMaxValue(d),
  };
}

/** Java `toMap()`; like Java it fails (NullPointerException) when `type` is null. */
export function toMap(d: ModelPropertyDescriptor): Record<string, unknown> {
  if (d.type == null) throw new RuntimeException("Cannot invoke \"PropertyType.name()\" because \"this.type\" is null");
  return {
    type: d.type.toLowerCase(),
    default_value: d.defaultValue,
    min_value: d.minValue,
    max_value: d.maxValue,
    editable: d.editable,
    label: d.label,
    description: d.description,
  };
}
