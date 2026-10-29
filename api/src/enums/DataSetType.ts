export const DataSetType = {
  SYSTEM: "SYSTEM",
  USER: "USER",
  COMMUNITY: "COMMUNITY",
} as const;
export type DataSetType = (typeof DataSetType)[keyof typeof DataSetType];

/** Declaration order (`DataSetType.values()`). */
export const DataSetTypeValues: DataSetType[] = [DataSetType.SYSTEM, DataSetType.USER, DataSetType.COMMUNITY];
