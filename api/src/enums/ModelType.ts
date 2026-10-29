export const ModelType = {
  SYSTEM: "SYSTEM",
  USER: "USER",
} as const;
export type ModelType = (typeof ModelType)[keyof typeof ModelType];

/** Declaration order (`ModelType.values()`). */
export const ModelTypeValues: ModelType[] = [ModelType.SYSTEM, ModelType.USER];
