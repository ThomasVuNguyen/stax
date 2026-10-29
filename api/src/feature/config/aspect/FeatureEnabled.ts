/**
 * Port of the @FeatureEnabled annotation + FeatureGateAspect. Use either
 * `app.get("/path", featureEnabled("key"), handler)` (Hono middleware) or call
 * `checkFeatureEnabled("key")` at the top of a handler/service. A disabled feature throws
 * FeatureDisabledException (rendered as 404 PATH_NOT_FOUND).
 */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../../../env";
import { FeatureDisabledException } from "../../../lib/errors";
import * as FeatureGateService from "../../service/FeatureGateService";

export function checkFeatureEnabled(featureKey: string): void {
  const isEnabled = FeatureGateService.isFeatureEnabled(featureKey);
  const commitHash = FeatureGateService.getCurrentMetadata()?.commit_hash ?? "N/A";
  console.info(
    `Feature check for key '${featureKey}' returning '${isEnabled}'. Configuration from commit: ${commitHash}`,
  );
  if (!isEnabled) {
    console.warn(`Access denied for feature: ${featureKey}. Endpoint is disabled.`);
    throw new FeatureDisabledException(`Feature '${featureKey}' is currently disabled.`);
  }
}

export function featureEnabled(featureKey: string): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    checkFeatureEnabled(featureKey);
    await next();
  };
}
