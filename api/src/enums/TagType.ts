export const TagType = {
  DATASET: "DATASET",
  MODEL: "MODEL",
  USER: "USER",
} as const;
export type TagType = (typeof TagType)[keyof typeof TagType];

/** Declaration order (`TagType.values()`). */
export const TagTypeValues: TagType[] = [TagType.DATASET, TagType.MODEL, TagType.USER];
