export const MonitoringType = {
  INFERENCE: "INFERENCE",
  EVALUATION: "EVALUATION",
} as const;
export type MonitoringType = (typeof MonitoringType)[keyof typeof MonitoringType];

/** Declaration order (`MonitoringType.values()`). */
export const MonitoringTypeValues: MonitoringType[] = [MonitoringType.INFERENCE, MonitoringType.EVALUATION];
