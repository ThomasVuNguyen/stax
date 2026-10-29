export const ScorerType = {
  system: "system",
  user: "user",
} as const;
export type ScorerType = (typeof ScorerType)[keyof typeof ScorerType];

/** Declaration order (`ScorerType.values()`). */
export const ScorerTypeValues: ScorerType[] = [ScorerType.system, ScorerType.user];
