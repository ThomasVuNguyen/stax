export const HumanSxsRating = {
  A_IS_BETTER: "A_IS_BETTER",
  B_IS_BETTER: "B_IS_BETTER",
  BOTH_ARE_BAD: "BOTH_ARE_BAD",
  BOTH_ARE_GOOD: "BOTH_ARE_GOOD",
} as const;
export type HumanSxsRating = (typeof HumanSxsRating)[keyof typeof HumanSxsRating];

/** Declaration order (`HumanSxsRating.values()`). */
export const HumanSxsRatingValues: HumanSxsRating[] = [HumanSxsRating.A_IS_BETTER, HumanSxsRating.B_IS_BETTER, HumanSxsRating.BOTH_ARE_BAD, HumanSxsRating.BOTH_ARE_GOOD];
