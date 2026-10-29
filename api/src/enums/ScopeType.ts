export const ScopeType = {
  SYSTEM: "SYSTEM",
  USER: "USER",
} as const;
export type ScopeType = (typeof ScopeType)[keyof typeof ScopeType];

/** Declaration order (`ScopeType.values()`). */
export const ScopeTypeValues: ScopeType[] = [ScopeType.SYSTEM, ScopeType.USER];
