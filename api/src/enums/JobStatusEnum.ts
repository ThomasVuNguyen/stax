/** Status codes are persisted as the integer `key` (status columns are INTEGER), not by ordinal. */
export const JobStatusEnum = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  STOPPED: "STOPPED",
} as const;
export type JobStatusEnum = (typeof JobStatusEnum)[keyof typeof JobStatusEnum];

/** Declaration order (`JobStatusEnum.values()`). */
export const JobStatusEnumValues: JobStatusEnum[] = [JobStatusEnum.PENDING, JobStatusEnum.IN_PROGRESS, JobStatusEnum.COMPLETED, JobStatusEnum.FAILED, JobStatusEnum.STOPPED];

export const JobStatusEnumKey: Record<JobStatusEnum, number> = {
  PENDING: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  FAILED: 4,
  STOPPED: 5,
};

export const JobStatusEnumValue: Record<JobStatusEnum, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In-Progress",
  COMPLETED: "Completed",
  FAILED: "Failed",
  STOPPED: "Stopped",
};

export function getKey(e: JobStatusEnum): number {
  return JobStatusEnumKey[e];
}

export function getValue(e: JobStatusEnum): string {
  return JobStatusEnumValue[e];
}

export function getValueByKey(key: number | null | undefined): string | null {
  const e = JobStatusEnumValues.find((s) => JobStatusEnumKey[s] === key);
  return e ? JobStatusEnumValue[e] : null;
}

export function getJobStatusEnumByKey(key: number | null | undefined): JobStatusEnum | null {
  return JobStatusEnumValues.find((s) => JobStatusEnumKey[s] === key) ?? null;
}
