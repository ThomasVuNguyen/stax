export const EvaluatorType = {
  USER: "USER",
  SYSTEM: "SYSTEM",
} as const;
export type EvaluatorType = (typeof EvaluatorType)[keyof typeof EvaluatorType];

/** Declaration order (`EvaluatorType.values()`). */
export const EvaluatorTypeValues: EvaluatorType[] = [EvaluatorType.USER, EvaluatorType.SYSTEM];
