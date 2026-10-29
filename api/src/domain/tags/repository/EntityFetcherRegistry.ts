/**
 * Port of domain/tags/repository/EntityFetcherRegistry. Java collected the @TaggableEntityFetcher
 * beans at startup; this is the explicit map. Both EvaluationMonitoringFetcher and
 * InferenceMonitoringFetcher were annotated INFERENCE_MONITORING, and the later bean (Inference,
 * in component-scan order) won, so EVALUATION_MONITORING has no fetcher.
 */
import type { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import type { EntityFetcher } from "./EntityFetcher";
import * as ChatFetcher from "./ChatFetcher";
import * as ChatTurnFetcher from "./ChatTurnFetcher";
import * as InferenceMonitoringFetcher from "./InferenceMonitoringFetcher";

const fetchers: Partial<Record<TagLinkTargetType, EntityFetcher>> = {
  CHAT: ChatFetcher,
  CHAT_TURN: ChatTurnFetcher,
  INFERENCE_MONITORING: InferenceMonitoringFetcher,
};

export function getFetcher(entityType: TagLinkTargetType): EntityFetcher | null {
  return fetchers[entityType] ?? null;
}
