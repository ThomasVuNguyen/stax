/** Status codes are persisted as the integer `key` (status columns are INTEGER), not by ordinal. */
export const InputStatusEnum = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCESSFUL: "SUCCESSFUL",
  FAILED: "FAILED",
} as const;
export type InputStatusEnum = (typeof InputStatusEnum)[keyof typeof InputStatusEnum];

/** Declaration order (`InputStatusEnum.values()`). */
export const InputStatusEnumValues: InputStatusEnum[] = [InputStatusEnum.PENDING, InputStatusEnum.IN_PROGRESS, InputStatusEnum.SUCCESSFUL, InputStatusEnum.FAILED];

export const InputStatusEnumKey: Record<InputStatusEnum, number> = {
  PENDING: 1,
  IN_PROGRESS: 2,
  SUCCESSFUL: 3,
  FAILED: 4,
};

export const InputStatusEnumValue: Record<InputStatusEnum, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In-Progress",
  SUCCESSFUL: "Successful",
  FAILED: "Failed",
};

export function getKey(e: InputStatusEnum): number {
  return InputStatusEnumKey[e];
}

export function getValue(e: InputStatusEnum): string {
  return InputStatusEnumValue[e];
}

export function getValueByKey(key: number | null | undefined): string | null {
  const e = InputStatusEnumValues.find((s) => InputStatusEnumKey[s] === key);
  return e ? InputStatusEnumValue[e] : null;
}
