/** Port of config/RetryConfig (the bean behind `llm-providers.retry`). Field defaults match the Java class. */
export interface RetryConfig {
  maxAttempts: number;
  /** Milliseconds. */
  initialInterval: number;
  multiplier: number;
  /** Milliseconds. */
  maxInterval: number;
  /** Status codes that may be retried; null/undefined = every non-excluded status. */
  includeStatusCodes?: readonly number[] | null;
  /** Status codes that are never retried. */
  excludeStatusCodes?: readonly number[] | null;
}

/** `new RetryConfig()` — Java field defaults, no include/exclude lists. */
export function newRetryConfig(overrides: Partial<RetryConfig> = {}): RetryConfig {
  return {
    maxAttempts: 3,
    initialInterval: 1000,
    multiplier: 2.0,
    maxInterval: 10000,
    includeStatusCodes: null,
    excludeStatusCodes: null,
    ...overrides,
  };
}
