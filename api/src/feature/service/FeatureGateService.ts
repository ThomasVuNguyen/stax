/**
 * Port of feature/service/FeatureGateService, delegating to the file-based strategy (the only one
 * available on Workers). The flags are static, so these functions take no ctx.
 * `getCurrentMetadata()` returns `Metadata | null` (Java Optional).
 */
import * as FileBasedFeatureGateStrategy from "./FileBasedFeatureGateStrategy";
import type { Metadata } from "../dto/Metadata";

export function initialLoad(): void {
  FileBasedFeatureGateStrategy.initialize();
}

export function isFeatureEnabled(featureKey: string): boolean {
  return FileBasedFeatureGateStrategy.isFeatureEnabled(featureKey);
}

export function getCurrentMetadata(): Metadata | null {
  return FileBasedFeatureGateStrategy.getCurrentMetadata();
}

export function getFeatures(): Record<string, boolean> {
  return FileBasedFeatureGateStrategy.getFeatures();
}

export function forceSynchronize(): void {
  FileBasedFeatureGateStrategy.forceSynchronize();
}
