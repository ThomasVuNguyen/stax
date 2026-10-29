/** Status codes are persisted as the integer `key` (status columns are INTEGER), not by ordinal. */
export const InferenceStatusEnum = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCESSFUL: "SUCCESSFUL",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
} as const;
export type InferenceStatusEnum = (typeof InferenceStatusEnum)[keyof typeof InferenceStatusEnum];

/** Declaration order (`InferenceStatusEnum.values()`). */
export const InferenceStatusEnumValues: InferenceStatusEnum[] = [InferenceStatusEnum.PENDING, InferenceStatusEnum.IN_PROGRESS, InferenceStatusEnum.SUCCESSFUL, InferenceStatusEnum.STOPPED, InferenceStatusEnum.FAILED];

export const InferenceStatusEnumKey: Record<InferenceStatusEnum, number> = {
  PENDING: 0,
  IN_PROGRESS: 2,
  SUCCESSFUL: 3,
  STOPPED: 4,
  FAILED: -1,
};

export const InferenceStatusEnumValue: Record<InferenceStatusEnum, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In-Progress",
  SUCCESSFUL: "Successful",
  STOPPED: "Stopped",
  FAILED: "Failed",
};

export function getKey(e: InferenceStatusEnum): number {
  return InferenceStatusEnumKey[e];
}

export function getValue(e: InferenceStatusEnum): string {
  return InferenceStatusEnumValue[e];
}

export function getValueByKey(key: number | null | undefined): string | null {
  const e = InferenceStatusEnumValues.find((s) => InferenceStatusEnumKey[s] === key);
  return e ? InferenceStatusEnumValue[e] : null;
}

export function getInferenceStatusEnumByKey(key: number | null | undefined): InferenceStatusEnum | null {
  return InferenceStatusEnumValues.find((s) => InferenceStatusEnumKey[s] === key) ?? null;
}
