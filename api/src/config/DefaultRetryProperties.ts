import { newRetryConfig, type RetryConfig } from "./RetryConfig";

/** `llm-providers.retry` from application.yaml (DefaultRetryProperties bean). Used by every LLM strategy. */
export const DefaultRetryProperties: RetryConfig = Object.freeze(
  newRetryConfig({
    maxAttempts: 3,
    initialInterval: 1000,
    multiplier: 2.0,
    maxInterval: 10000,
    includeStatusCodes: Object.freeze([429, 500, 502, 503, 504]),
    excludeStatusCodes: Object.freeze([400, 401, 403, 404, 405]),
  }),
);
