import { UnsupportedOperationException } from "../lib/errors";
import { ApplicationLimits } from "./ApplicationLimits";

/**
 * Port of config/ContainerLimitProvider. EvaluationContainer is a single-table hierarchy whose
 * discriminator column `container_type` is "PROJECT" (Project) or "DATASET" (DataSet). Pass either
 * the discriminator value or any object carrying it as `containerType`.
 */
export function getMaxChatsLimit(container: string | { containerType?: string | null }): number {
  const type = typeof container === "string" ? container : container.containerType;
  if (type === "PROJECT") return ApplicationLimits.maxChatsPerProject;
  if (type === "DATASET") return ApplicationLimits.maxChatsPerDataSet;
  throw new UnsupportedOperationException(`No chat limit defined for container type: ${type}`);
}
