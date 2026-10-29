/**
 * Port of domain/pubsub/LLMScoreQueueService: the `llm-eval` queue (pointwise LLM and pairwise
 * evaluations). The nine per-provider topics and their "bulk" twins collapse into the single
 * queue; `sendToQueue` keeps the Java signature (provider / isBulk are only validated / ignored).
 */
import { checkJobActive } from "../../aspect/JobStatusCheck";
import type { Ctx } from "../../lib/ctx";
import { findUserById } from "../../lib/auth";
import { IllegalArgumentException, UserNotFoundException } from "../../lib/errors";
import { publish, publishAll } from "../../lib/queue";
import { EvaluationStatusEnum, getEvaluationStatusEnumByKey } from "../../enums/EvaluationStatusEnum";
import { type ModelProvider, ModelProviderValues } from "../../enums/ModelProvider";
import * as EvaluationStatusService from "../evaluationstatus/EvaluationStatusService";
import type { EvaluationDTO } from "../evaluation/dto/EvaluationDTO";
import * as EvaluationService from "../evaluation/serivce/EvaluationService";
import * as AbstractScoreQueueService from "../job/AbstractScoreQueueService";

/** The Java switch threw for providers without an eval topic (every current provider has one). */
export function assertSupportedProvider(modelProvider: ModelProvider | null): void {
  if (modelProvider == null || !ModelProviderValues.includes(modelProvider)) {
    throw new IllegalArgumentException(
      `Unsupported Model Provider: ${modelProvider}. Valid providers are: [${ModelProviderValues.join(", ")}]`,
    );
  }
}

export async function sendToQueue(
  ctx: Ctx,
  evaluationDTO: EvaluationDTO,
  modelProvider: ModelProvider | null,
  _isBulk: boolean,
): Promise<void> {
  assertSupportedProvider(modelProvider);
  await publish(ctx.env, "llm-eval", evaluationDTO);
}

/** Batched publish (Queue.sendBatch, 100 per call) used by EvaluationBatchService. */
export async function sendAllToQueue(ctx: Ctx, evaluationDTOs: EvaluationDTO[]): Promise<void> {
  if (evaluationDTOs.length) await publishAll(ctx.env, "llm-eval", evaluationDTOs);
}

/**
 * Worker for one `llm-eval` message (@CheckJobActive: a stopped or unknown job throws before any
 * work). A STOPPED evaluation is skipped. Failures are recorded on the evaluation status by
 * EvaluationService and the job counters are recomputed either way.
 */
export async function process(ctx: Ctx, evaluationDTO: EvaluationDTO): Promise<void> {
  await checkJobActive(ctx, evaluationDTO);
  try {
    const currentEvaluationStatus = await EvaluationStatusService.findById(ctx, evaluationDTO.evaluationStatusId as string);
    if (getEvaluationStatusEnumByKey(currentEvaluationStatus.status) === EvaluationStatusEnum.STOPPED) {
      console.info(`Skipping processing for Evaluation (id: ${currentEvaluationStatus.id}), because its status is STOPPED.`);
      return;
    }
    const user = await findUserById(ctx.db, evaluationDTO.userId as string);
    if (!user) throw new UserNotFoundException();
    const userCtx: Ctx = { ...ctx, user };

    await EvaluationService.generateScoreWithStatus(
      userCtx,
      evaluationDTO.pairId,
      evaluationDTO.chatTurnId,
      evaluationDTO.chatturnIdB,
      evaluationDTO.evaluatorId as string,
      evaluationDTO.containerId,
      currentEvaluationStatus,
      user,
      false,
    );
    console.log(
      `LLM Scorer Processing successfully completed. Chat turn Id: ${evaluationDTO.chatTurnId} and Evaluation Status Id:${evaluationDTO.evaluationStatusId}`,
    );
    await AbstractScoreQueueService.trackJobStatus(ctx, evaluationDTO);
  } catch (e) {
    console.error("LLM Scorer Calculation failed due to Exception.", e);
    await AbstractScoreQueueService.trackJobStatus(ctx, evaluationDTO);
  }
}
