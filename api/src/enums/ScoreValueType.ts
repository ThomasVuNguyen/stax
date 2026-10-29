export const ScoreValueType = {
  INTEGER: "INTEGER",
  DECIMAL: "DECIMAL",
} as const;
export type ScoreValueType = (typeof ScoreValueType)[keyof typeof ScoreValueType];

/** Declaration order (`ScoreValueType.values()`). */
export const ScoreValueTypeValues: ScoreValueType[] = [ScoreValueType.INTEGER, ScoreValueType.DECIMAL];
