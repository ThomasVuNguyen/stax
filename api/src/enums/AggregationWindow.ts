export const AggregationWindow = {
  PER_SECOND: "PER_SECOND",
  PER_15_SECONDS: "PER_15_SECONDS",
  PER_MINUTE: "PER_MINUTE",
  HOURLY: "HOURLY",
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;
export type AggregationWindow = (typeof AggregationWindow)[keyof typeof AggregationWindow];

/** Declaration order (`AggregationWindow.values()`). */
export const AggregationWindowValues: AggregationWindow[] = [AggregationWindow.PER_SECOND, AggregationWindow.PER_15_SECONDS, AggregationWindow.PER_MINUTE, AggregationWindow.HOURLY, AggregationWindow.DAILY, AggregationWindow.WEEKLY, AggregationWindow.MONTHLY];

export const AggregationWindowValue: Record<AggregationWindow, string> = {
  PER_SECOND: "per_second",
  PER_15_SECONDS: "per_15_seconds",
  PER_MINUTE: "per_minute",
  HOURLY: "hourly",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
};

export function getValue(e: AggregationWindow): string {
  return AggregationWindowValue[e];
}

/** Case-insensitive lookup by `value`; null for null input; throws for unknown text (like Java). */
export function fromValue(text: string | null | undefined): AggregationWindow | null {
  if (text === null || text === undefined) return null;
  const found = AggregationWindowValues.find((w) => AggregationWindowValue[w].toLowerCase() === text.toLowerCase());
  if (!found) throw new Error("Unknown aggregation window: " + text);
  return found;
}
