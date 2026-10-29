export const EvaluationType = {
  POINTWISE: "POINTWISE",
  SXS: "SXS",
} as const;
export type EvaluationType = (typeof EvaluationType)[keyof typeof EvaluationType];

/** Declaration order (`EvaluationType.values()`). */
export const EvaluationTypeValues: EvaluationType[] = [EvaluationType.POINTWISE, EvaluationType.SXS];
