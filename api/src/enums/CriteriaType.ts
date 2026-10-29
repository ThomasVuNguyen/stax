export const CriteriaType = {
  CONTAINS: "CONTAINS",
  REGEX: "REGEX",
} as const;
export type CriteriaType = (typeof CriteriaType)[keyof typeof CriteriaType];

/** Declaration order (`CriteriaType.values()`). */
export const CriteriaTypeValues: CriteriaType[] = [CriteriaType.CONTAINS, CriteriaType.REGEX];
