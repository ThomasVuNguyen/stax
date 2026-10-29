import type { Metadata } from "./Metadata";

/** Port of feature/dto/FeatureStateDTO. `Optional<Metadata>` is serialised as the value or null (Jdk8Module). */
export interface FeatureStateDTO {
  metadata: Metadata | null;
  features: Record<string, boolean>;
}
