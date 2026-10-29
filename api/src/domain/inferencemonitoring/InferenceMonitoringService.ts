/**
 * Port of domain/inferencemonitoring/InferenceMonitoringService(+Impl).
 * (`clearEvaluatiionContainerReference` keeps the Java spelling.)
 */
import type { Ctx } from "../../lib/ctx";
import { RuntimeException } from "../../lib/errors";
import * as InferenceMonitoringEntity from "../../entities/InferenceMonitoring";
import type { InferenceMonitoring } from "../../entities/InferenceMonitoring";
import type { Model } from "../../entities/Model";
import type { User } from "../../entities/User";
import type { ChatResponseWithLatency } from "../../llmproviders/dto/ChatResponseWithLatency";
import type { ProjectInferenceMonitoringSummaryDTO } from "../analytics/inference/dto/ProjectInferenceMonitoringSummaryDTO";
import * as InferenceMonitoringRepository from "./InferenceMonitoringRepository";

/** The Java setters take `int`: unboxing a null Integer threw a NullPointerException. */
function intValue(v: number | null | undefined, getter: string): number {
  if (v == null) {
    throw new RuntimeException(
      `Cannot invoke "java.lang.Integer.intValue()" because the return value of "com.planck.planck.llmproviders.dto.ChatResponseWithLatency.${getter}()" is null`,
    );
  }
  return v;
}

export async function saveInferenceMonitoring(
  ctx: Ctx,
  user: Pick<User, "id">,
  chatResponse: ChatResponseWithLatency,
  model: Model,
  project: { id: string | null },
  previousInferenceMonitoring: InferenceMonitoring | null,
): Promise<InferenceMonitoring> {
  const im = InferenceMonitoringEntity.createForTurn(model, user.id, project.id, previousInferenceMonitoring);
  InferenceMonitoringEntity.setTimetaken(im, chatResponse.latencyMillis);
  InferenceMonitoringEntity.setPromptTokens(im, intValue(chatResponse.promptTokens, "getPromptTokens"));
  InferenceMonitoringEntity.setCompletionTokens(
    im,
    intValue(chatResponse.turnCompletionTokens, "getTurnCompletionTokens"),
  );
  InferenceMonitoringEntity.setTotalTokens(im, intValue(chatResponse.totalTokens, "getTotalTokens"));
  return InferenceMonitoringRepository.save(ctx.db, im);
}

export async function save(ctx: Ctx, inferenceMonitoring: InferenceMonitoring): Promise<InferenceMonitoring> {
  return InferenceMonitoringRepository.save(ctx.db, inferenceMonitoring);
}

/** Accepts the container (any object with an id) or its id. */
export async function clearEvaluatiionContainerReference(
  ctx: Ctx,
  container: string | { id: string | null },
): Promise<void> {
  const id = typeof container === "string" ? container : container.id;
  await InferenceMonitoringRepository.clearEvaluationContainerReference(ctx.db, id as string);
}

export async function getProjectInferenceMonitoringSummary(
  ctx: Ctx,
  user: Pick<User, "id">,
  projectId: string,
): Promise<ProjectInferenceMonitoringSummaryDTO> {
  return InferenceMonitoringRepository.getProjectInferenceMonitoringSummary(ctx.db, projectId, user.id as string);
}
