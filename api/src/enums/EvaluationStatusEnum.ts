/** Status codes are persisted as the integer `key` (status columns are INTEGER), not by ordinal. */
export const EvaluationStatusEnum = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCESSFUL: "SUCCESSFUL",
  STOPPED: "STOPPED",
  FAILED: "FAILED",
} as const;
export type EvaluationStatusEnum = (typeof EvaluationStatusEnum)[keyof typeof EvaluationStatusEnum];

/** Declaration order (`EvaluationStatusEnum.values()`). */
export const EvaluationStatusEnumValues: EvaluationStatusEnum[] = [EvaluationStatusEnum.PENDING, EvaluationStatusEnum.IN_PROGRESS, EvaluationStatusEnum.SUCCESSFUL, EvaluationStatusEnum.STOPPED, EvaluationStatusEnum.FAILED];

export const EvaluationStatusEnumKey: Record<EvaluationStatusEnum, number> = {
  PENDING: 0,
  IN_PROGRESS: 2,
  SUCCESSFUL: 3,
  STOPPED: 4,
  FAILED: -1,
};

export const EvaluationStatusEnumValue: Record<EvaluationStatusEnum, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In-Progress",
  SUCCESSFUL: "Successful",
  STOPPED: "Stopped",
  FAILED: "Failed",
};

export function getKey(e: EvaluationStatusEnum): number {
  return EvaluationStatusEnumKey[e];
}

export function getValue(e: EvaluationStatusEnum): string {
  return EvaluationStatusEnumValue[e];
}

export function getValueByKey(key: number | null | undefined): string | null {
  const e = EvaluationStatusEnumValues.find((s) => EvaluationStatusEnumKey[s] === key);
  return e ? EvaluationStatusEnumValue[e] : null;
}

export function getEvaluationStatusEnumByKey(key: number | null | undefined): EvaluationStatusEnum | null {
  return EvaluationStatusEnumValues.find((s) => EvaluationStatusEnumKey[s] === key) ?? null;
}
