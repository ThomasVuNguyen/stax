export const HumanEvalRangeDataType = {
  INTEGER: "INTEGER",
  DOUBLE: "DOUBLE",
} as const;
export type HumanEvalRangeDataType = (typeof HumanEvalRangeDataType)[keyof typeof HumanEvalRangeDataType];

/** Declaration order (`HumanEvalRangeDataType.values()`). */
export const HumanEvalRangeDataTypeValues: HumanEvalRangeDataType[] = [HumanEvalRangeDataType.INTEGER, HumanEvalRangeDataType.DOUBLE];
