export const LinkedEntityType = {
  MODEL_RESPONSE: "MODEL_RESPONSE",
  EVALUATOR: "EVALUATOR",
  VIEW: "VIEW",
} as const;
export type LinkedEntityType = (typeof LinkedEntityType)[keyof typeof LinkedEntityType];

/** Declaration order (`LinkedEntityType.values()`). */
export const LinkedEntityTypeValues: LinkedEntityType[] = [LinkedEntityType.MODEL_RESPONSE, LinkedEntityType.EVALUATOR, LinkedEntityType.VIEW];
