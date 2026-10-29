/** Status codes are persisted as the integer `key` (status columns are INTEGER), not by ordinal. */
export const BulkStatusEnum = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  SUCCESSFUL: "SUCCESSFUL",
  FAILED: "FAILED",
} as const;
export type BulkStatusEnum = (typeof BulkStatusEnum)[keyof typeof BulkStatusEnum];

/** Declaration order (`BulkStatusEnum.values()`). */
export const BulkStatusEnumValues: BulkStatusEnum[] = [BulkStatusEnum.PENDING, BulkStatusEnum.IN_PROGRESS, BulkStatusEnum.SUCCESSFUL, BulkStatusEnum.FAILED];

export const BulkStatusEnumKey: Record<BulkStatusEnum, number> = {
  PENDING: 1,
  IN_PROGRESS: 2,
  SUCCESSFUL: 3,
  FAILED: 4,
};

export const BulkStatusEnumValue: Record<BulkStatusEnum, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In-Progress",
  SUCCESSFUL: "Successful",
  FAILED: "Failed",
};

export function getKey(e: BulkStatusEnum): number {
  return BulkStatusEnumKey[e];
}

export function getValue(e: BulkStatusEnum): string {
  return BulkStatusEnumValue[e];
}

export function getValueByKey(key: number | null | undefined): string | null {
  const e = BulkStatusEnumValues.find((s) => BulkStatusEnumKey[s] === key);
  return e ? BulkStatusEnumValue[e] : null;
}

export function getScroreStatusEnumByKey(key: number | null | undefined): BulkStatusEnum | null {
  return BulkStatusEnumValues.find((s) => BulkStatusEnumKey[s] === key) ?? null;
}
