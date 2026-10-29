export const ScoreType = {
  Json: "Json",
  String: "String",
  Double: "Double",
  Integer: "Integer",
  Choices: "Choices",
  Boolean: "Boolean",
  HUMAN_BINARY: "HUMAN_BINARY",
} as const;
export type ScoreType = (typeof ScoreType)[keyof typeof ScoreType];

/** Declaration order (`ScoreType.values()`). */
export const ScoreTypeValues: ScoreType[] = [ScoreType.Json, ScoreType.String, ScoreType.Double, ScoreType.Integer, ScoreType.Choices, ScoreType.Boolean, ScoreType.HUMAN_BINARY];

/** Case-insensitive lookup by name; null when unknown. */
export function fromString(type: string | null | undefined): ScoreType | null {
  if (type === null || type === undefined) return null;
  return ScoreTypeValues.find((t) => t.toLowerCase() === type.toLowerCase()) ?? null;
}
