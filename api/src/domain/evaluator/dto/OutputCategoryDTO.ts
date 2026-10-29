/**
 * Port of domain/evaluator/dto/OutputCategoryDTO (@JsonInclude NON_NULL, unknown properties
 * ignored). `color_name` is derived from `color` when not set explicitly (setColor/getColorName).
 */
import { checkNumberRange } from "../../../annotation/NumberRange";

export interface OutputCategoryDTO {
  name?: string | null;
  color?: string | null;
  color_name?: string | null;
  value?: string | null;
  start_range?: string | null;
  end_range?: string | null;
}

const CSS_VARS: Record<string, string> = {
  "var(--color-red)": "Red",
  "var(--color-green)": "Green",
  "var(--color-blue)": "Blue",
  "var(--color-purple)": "Purple",
  "var(--color-pink)": "Pink",
  "var(--color-orange)": "Orange",
  "var(--color-yellow)": "Yellow",
};

const HEX: Record<string, string> = {
  f84464: "Red",
  "03c89a": "Green",
  "3d95fc": "Blue",
  b66eff: "Purple",
  ffa2af: "Pink",
  f99c07: "Orange",
  "5f5bff": "Violet",
  "8595ab": "Grey",
  "737284": "Slate Gray",
  ffe3e3: "Light Red",
  fff3bf: "Light Yellow",
  d3f9d8: "Light Green",
};

export function deriveColorName(color: string | null | undefined): string | null {
  if (color == null) return null;
  return CSS_VARS[color] ?? HEX[color.toLowerCase().replace(/#/g, "")] ?? null;
}

/** Jackson round trip (deserialise + serialise): known fields only, nulls dropped, color_name derived. */
export function normalize(c: OutputCategoryDTO | null | undefined): OutputCategoryDTO | null {
  if (c == null) return null;
  const out: OutputCategoryDTO = {};
  if (c.name != null) out.name = c.name;
  if (c.color != null) out.color = c.color;
  const colorName = c.color_name ?? deriveColorName(c.color);
  if (colorName != null) out.color_name = colorName;
  if (c.value != null) out.value = c.value;
  if (c.start_range != null) out.start_range = c.start_range;
  if (c.end_range != null) out.end_range = c.end_range;
  return out;
}

export function normalizeList(list: (OutputCategoryDTO | null)[] | null | undefined): (OutputCategoryDTO | null)[] | null {
  return list == null ? null : list.map(normalize);
}

/** @Valid List<OutputCategoryDTO>: `<field>[i].value: <@NumberRange message>` per invalid element. */
export function validateList(list: (OutputCategoryDTO | null)[] | null | undefined, field: string): string[] {
  const errors: string[] = [];
  (list ?? []).forEach((c, i) => {
    if (c == null) return;
    const err = checkNumberRange(c.value, `${field}[${i}].value`);
    if (err) errors.push(err);
  });
  return errors;
}
