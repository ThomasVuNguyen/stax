import type { Feature } from "./Feature";
import type { Metadata } from "./Metadata";

/** Port of feature/dto/FeatureConfig: shape of default-feature-flags.json. */
export interface FeatureConfig {
  version: string | null;
  metadata: Metadata | null;
  features: Feature[];
}
