export const ScoringMechanismType = {
  CATEGORY: "CATEGORY",
  RANGE: "RANGE",
} as const;
export type ScoringMechanismType = (typeof ScoringMechanismType)[keyof typeof ScoringMechanismType];

/** Declaration order (`ScoringMechanismType.values()`). */
export const ScoringMechanismTypeValues: ScoringMechanismType[] = [ScoringMechanismType.CATEGORY, ScoringMechanismType.RANGE];
