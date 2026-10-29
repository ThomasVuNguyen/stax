/** Port of util/PromptUtil: `{{variable}}` substitution in prompts. */

const VARIABLE_PATTERN = /\{\{(\w+)\}\}/;
const VARIABLE_PATTERN_G = /\{\{(\w+)\}\}/g;

export type Variables = Record<string, string | null | undefined> | Map<string, string | null | undefined>;

function size(v: Variables): number {
  return v instanceof Map ? v.size : Object.keys(v).length;
}
function has(v: Variables, k: string): boolean {
  return v instanceof Map ? v.has(k) : Object.prototype.hasOwnProperty.call(v, k);
}
function get(v: Variables, k: string): string | null | undefined {
  return v instanceof Map ? v.get(k) : has(v, k) ? v[k] : undefined;
}

export function containsVariableInput(text: string): boolean {
  return VARIABLE_PATTERN.test(text);
}

/** Replaces known variables with their value; unknown (or null-valued) placeholders are kept. */
export function enrichText<T extends string | null | undefined>(text: T, variables: Variables | null | undefined): T {
  if (text === null || text === undefined || !variables || size(variables) === 0) return text;
  return text.replace(VARIABLE_PATTERN_G, (match, key: string) => {
    const value = get(variables, key);
    return value === null || value === undefined ? match : value;
  }) as T;
}

/** Replaces every placeholder with the `<variable .../>` tag the frontend renders. */
export function enrichTextForResponse<T extends string | null | undefined>(
  text: T,
  variables: Variables | null | undefined,
): T {
  if (text === null || text === undefined || !variables || size(variables) === 0) return text;
  return text.replace(VARIABLE_PATTERN_G, (_match, key: string) => {
    // Map.getOrDefault: a present-but-null value formats as "null".
    const value = has(variables, key) ? String(get(variables, key) ?? null) : "VARIABLE_NOT_FOUND";
    return `<variable color="var(--color-brand)" value="${value}" tooltip="${key}"/>`;
  }) as T;
}
