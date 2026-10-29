/** Status codes are persisted as the integer `key` (status columns are INTEGER), not by ordinal. */
export const ScorerStatusEnum = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCESSFUL: "SUCCESSFUL",
  FAILED: "FAILED",
} as const;
export type ScorerStatusEnum = (typeof ScorerStatusEnum)[keyof typeof ScorerStatusEnum];

/** Declaration order (`ScorerStatusEnum.values()`). */
export const ScorerStatusEnumValues: ScorerStatusEnum[] = [ScorerStatusEnum.PENDING, ScorerStatusEnum.IN_PROGRESS, ScorerStatusEnum.SUCCESSFUL, ScorerStatusEnum.FAILED];

export const ScorerStatusEnumKey: Record<ScorerStatusEnum, number> = {
  PENDING: 1,
  IN_PROGRESS: 2,
  SUCCESSFUL: 3,
  FAILED: 4,
};

export const ScorerStatusEnumValue: Record<ScorerStatusEnum, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In-Progress",
  SUCCESSFUL: "Successful",
  FAILED: "Failed",
};

export function getKey(e: ScorerStatusEnum): number {
  return ScorerStatusEnumKey[e];
}

export function getValue(e: ScorerStatusEnum): string {
  return ScorerStatusEnumValue[e];
}

export function getValueByKey(key: number | null | undefined): string | null {
  const e = ScorerStatusEnumValues.find((s) => ScorerStatusEnumKey[s] === key);
  return e ? ScorerStatusEnumValue[e] : null;
}

export function getScroreStatusEnumByKey(key: number | null | undefined): ScorerStatusEnum | null {
  return ScorerStatusEnumValues.find((s) => ScorerStatusEnumKey[s] === key) ?? null;
}
