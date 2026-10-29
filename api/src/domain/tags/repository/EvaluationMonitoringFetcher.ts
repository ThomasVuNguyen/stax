/**
 * Port of domain/tags/repository/EvaluationMonitoringFetcher. Java annotated it with
 * @TaggableEntityFetcher(INFERENCE_MONITORING) and InferenceMonitoringFetcher replaced it in the
 * registry, so it is never used (see EntityFetcherRegistry); kept for parity. Builds the
 * analytics EvaluationMonitoringDTO JSON (Taggable EVALUATION_MONITORING).
 */
import type { Ctx } from "../../../lib/ctx";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import * as EvaluationMonitoringRepository from "../../evaluationmonitoring/EvaluationMonitoringRepository";
import * as LLMEvaluatorRepository from "../../evaluator/llm/LLMEvaluatorRepository";
import type { TagDTO } from "../dto/TagDTO";
import { markTaggable } from "../dto/Taggable";

export interface EvaluationMonitoringDTO {
  id: string | null;
  eval_model_id: string | null;
  project_id: string | null;
  evaluator_name: string | null;
  evaluator_id: string | null;
  time_taken: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  created_at: string | null;
  updated_at: string | null;
  tags: TagDTO[] | null;
}

export async function findAllByIds(
  ctx: Ctx,
  ids: string[],
  user: { id: string | null },
): Promise<EvaluationMonitoringDTO[]> {
  const list = await EvaluationMonitoringRepository.findEvaluationMonitroginsByList(ctx.db, ids, user.id as string);
  const evaluators = new Map(
    (await LLMEvaluatorRepository.findAllById(ctx.db, [
      ...new Set(list.map((e) => e.evaluatorId).filter((x): x is string => x != null)),
    ])).map((e) => [e.id, e]),
  );
  return list.map((em) =>
    markTaggable(
      {
        id: em.id,
        eval_model_id: em.modelId,
        project_id: em.containerId,
        evaluator_name: (em.evaluatorId && evaluators.get(em.evaluatorId)?.name) ?? null,
        evaluator_id: em.evaluatorId,
        time_taken: em.timeTaken,
        prompt_tokens: em.promptTokens,
        completion_tokens: em.completionTokens,
        total_tokens: em.totalTokens,
        created_at: em.createdAt,
        updated_at: em.updatedAt,
        tags: null,
      },
      TagLinkTargetType.EVALUATION_MONITORING,
      em.id,
    ),
  );
}
