/**
 * Port of feature/service/FileBasedFeatureGateStrategy: the feature gates come from the bundled
 * server/src/main/resources/default-feature-flags.json. This is the only strategy on Workers; the
 * Redis strategies (DirectRedis/Cached) and the GCS event consumer that refreshed them are dropped.
 */
import defaultFlags from "../../../../server/src/main/resources/default-feature-flags.json";
import type { FeatureConfig } from "../dto/FeatureConfig";
import type { Metadata } from "../dto/Metadata";

const localCache = new Map<string, boolean>();
let currentMetadata: Metadata | null = null;

(function loadDefaultFile() {
  try {
    const config = defaultFlags as unknown as FeatureConfig;
    for (const feature of config.features) localCache.set(feature.key, feature.enabled === true);
    currentMetadata = config.metadata
      ? {
          commit_hash: config.metadata.commit_hash ?? null,
          author: config.metadata.author ?? null,
          deploy_time_utc: config.metadata.deploy_time_utc ?? null,
        }
      : null;
  } catch (e) {
    console.error("CRITICAL: Could not load feature gates from default-feature-flags.json.", e);
  }
})();

export function initialize(): void {
  console.info("Initializing FileBasedFeatureGateStrategy (Redis is disabled).");
}

export function isFeatureEnabled(featureKey: string): boolean {
  return localCache.get(featureKey) ?? false;
}

export function getCurrentMetadata(): Metadata | null {
  return currentMetadata;
}

/** No-op: this strategy cannot be synchronized from an external source. */
export function forceSynchronize(): void {
  console.warn("forceSynchronize called, but no action is taken. Redis is disabled.");
}

export function getFeatures(): Record<string, boolean> {
  return Object.fromEntries(localCache);
}
