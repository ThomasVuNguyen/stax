/**
 * Port of domain/evaluationmonitoring/EvaluationMonitoringService(+Impl).
 *
 * Overloads:
 * - `saveEvaluationMonitoring(ctx, user, response, model, llmEvaluator, container)` (LLMEvaluator)
 *   and `saveEvaluationMonitoringForPairwise(...)` (PairwiseLLMEvaluator).
 * - `deleteEvaluationMonitoringAndRelatedScores(ctx, arg, user?)` dispatches on `arg` like the
 *   Java overloads: a container (`{ id }`) + user, a list/set of monitoring ids + user, or a list
 *   of EvaluationMonitoring entities. Explicit variants: `...ByContainer`, `...ByIds`, `...ByEntities`.
 */
import type { Ctx } from "../../lib/ctx";
import { type EvaluationMonitoring, create } from "../../entities/EvaluationMonitoring";
import type { Model } from "../../entities/Model";
import type { ChatResponseWithLatency } from "../../llmproviders/dto/ChatResponseWithLatency";
import * as ScoreV2Repository from "../evaluation/ScoreV2Repository";
import * as EvaluationMonitoringRepository from "./EvaluationMonitoringRepository";

type UserRef = { id: string | null };
type ContainerRef = { id: string | null } | null;

function build(
  user: UserRef,
  response: ChatResponseWithLatency,
  model: Model,
  container: ContainerRef,
  evaluator: { evaluatorId?: string | null; pairwiseEvaluatorId?: string | null },
): EvaluationMonitoring {
  return create({
    modelId: model.id,
    userId: user.id,
    containerId: container?.id ?? null,
    modelProvider: model.provider,
    ...evaluator,
    timeTaken: response.latencyMillis,
    promptTokens: response.promptTokens,
    completionTokens: response.turnCompletionTokens,
    totalTokens: response.totalTokens,
  });
}

export async function saveEvaluationMonitoring(
  ctx: Ctx,
  user: UserRef,
  chatResponse: ChatResponseWithLatency,
  model: Model,
  evaluator: { id: string | null },
  container: ContainerRef,
): Promise<EvaluationMonitoring> {
  return EvaluationMonitoringRepository.save(ctx.db, build(user, chatResponse, model, container, { evaluatorId: evaluator.id }));
}

export async function saveEvaluationMonitoringForPairwise(
  ctx: Ctx,
  user: UserRef,
  response: ChatResponseWithLatency,
  evalModel: Model,
  llmEvaluator: { id: string | null },
  container: ContainerRef,
): Promise<EvaluationMonitoring> {
  return EvaluationMonitoringRepository.save(
    ctx.db,
    build(user, response, evalModel, container, { pairwiseEvaluatorId: llmEvaluator.id }),
  );
}

export async function deleteEvaluationMonitoringAndRelatedScoresByEntities(
  ctx: Ctx,
  evaluationMonitorings: EvaluationMonitoring[],
): Promise<void> {
  const ids = evaluationMonitorings.map((m) => m.id).filter((id): id is string => id != null);
  await ScoreV2Repository.deleteByEvaluationMonitoringIn(ctx.db, ids);
  await EvaluationMonitoringRepository.deleteAll(ctx.db, evaluationMonitorings);
}

export async function deleteEvaluationMonitoringAndRelatedScoresByContainer(
  ctx: Ctx,
  container: { id: string | null },
  user: UserRef,
): Promise<void> {
  const list = await EvaluationMonitoringRepository.findEvaluationMonitoringByContainerAndUser(
    ctx.db,
    container.id as string,
    user.id as string,
  );
  await deleteEvaluationMonitoringAndRelatedScoresByEntities(ctx, list);
}

export async function deleteEvaluationMonitoringAndRelatedScoresByIds(
  ctx: Ctx,
  monitoringIds: Iterable<string>,
  user: UserRef,
): Promise<void> {
  const list = await EvaluationMonitoringRepository.findEvaluationMonitroginsByList(ctx.db, [...monitoringIds], user.id as string);
  await deleteEvaluationMonitoringAndRelatedScoresByEntities(ctx, list);
}

export async function deleteEvaluationMonitoringAndRelatedScores(
  ctx: Ctx,
  arg: { id: string | null } | Iterable<string> | EvaluationMonitoring[],
  user?: UserRef,
): Promise<void> {
  if (Array.isArray(arg) || arg instanceof Set) {
    const items = [...(arg as Iterable<unknown>)];
    if (items.length && typeof items[0] === "object") {
      return deleteEvaluationMonitoringAndRelatedScoresByEntities(ctx, items as EvaluationMonitoring[]);
    }
    return deleteEvaluationMonitoringAndRelatedScoresByIds(ctx, items as string[], user as UserRef);
  }
  return deleteEvaluationMonitoringAndRelatedScoresByContainer(ctx, arg as { id: string | null }, user as UserRef);
}
