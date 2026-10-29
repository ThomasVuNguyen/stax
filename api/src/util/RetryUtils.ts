import type { RetryConfig } from "../config/RetryConfig";
import { RuntimeException } from "../lib/errors";

/**
 * Port of util/RetryUtils.
 *
 * The action reports its outcome as a StatusResult: statusCode 200 = success (value is returned),
 * anything else = failure carrying the upstream HTTP status and error detail. An action that throws
 * is treated like a failure with an unknown status.
 *
 * Semantics kept from the Java version:
 * - at most `maxAttempts` calls (attempt + 1 >= maxAttempts stops);
 * - unknown status (the action threw before any status was seen) is always retried;
 * - statuses in `excludeStatusCodes` are never retried; when `includeStatusCodes` is set only
 *   those are retried;
 * - the delay is multiplied *before* each wait: initialInterval 1000 / multiplier 2 waits 2000ms
 *   then 4000ms, capped at maxInterval;
 * - the last status and error message stick across attempts (an attempt that throws after a
 *   status result is classified with that earlier status);
 * - the final error is a RuntimeException whose message is the upstream error detail (falling
 *   back to the thrown message, then "Request failed with status <code>"), with the last failure
 *   as `cause`. Java's CompletionException "java.lang.RuntimeException: " prefixes are not
 *   reproduced.
 */

export interface StatusResult<T> {
  value: T | null;
  statusCode: number;
  errorMessage: string | null;
}

export type SupplierWithStatus<T> = () => Promise<StatusResult<T>> | StatusResult<T>;

/** `new StatusResult<>(value, statusCode[, errorMessage])`. */
export function statusResult<T>(
  value: T | null,
  statusCode: number,
  errorMessage: string | null = null,
): StatusResult<T> {
  return { value, statusCode, errorMessage };
}

export async function executeWithRetry<T>(action: SupplierWithStatus<T>, config: RetryConfig): Promise<T> {
  let attempt = 0;
  let wait = config.initialInterval;
  let lastStatusCode: number | null = null;
  let errorMessage: string | null = null;

  for (;;) {
    let failure: unknown;
    try {
      const result = await action();
      if (result.statusCode === 200) return result.value as T;
      lastStatusCode = result.statusCode;
      errorMessage = result.errorMessage;
      failure = new Error(
        result.errorMessage ? result.errorMessage : `Request failed with HTTP ${result.statusCode}`,
      );
    } catch (e) {
      failure = e;
    }

    if (!shouldRetry(lastStatusCode, attempt, config)) {
      const thrownMessage = failure instanceof Error ? failure.message : String(failure ?? "");
      const message = errorMessage
        ? errorMessage
        : thrownMessage
          ? thrownMessage
          : `Request failed with status ${lastStatusCode}`;
      throw new RuntimeException(message, { cause: failure });
    }

    attempt++;
    wait = Math.min(Math.trunc(wait * config.multiplier), config.maxInterval);
    await sleep(wait);
  }
}

function shouldRetry(statusCode: number | null, attempt: number, config: RetryConfig): boolean {
  if (attempt + 1 >= config.maxAttempts) return false;
  if (statusCode === null) return true;
  if (statusCode === 200) return false;
  if (config.excludeStatusCodes && config.excludeStatusCodes.includes(statusCode)) return false;
  if (!config.includeStatusCodes) return true;
  return config.includeStatusCodes.includes(statusCode);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
