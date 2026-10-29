/**
 * Port of domain/pubsub/PointwiseHeuristicEvaluationScoreQueueService: the `heuristic-eval`
 * queue (the regular and "bulk" topics collapse into the single queue).
 */
import { checkJobActive } from "../../aspect/JobStatusCheck";
import type { Ctx } from "../../lib/ctx";
import { findUserById } from "../../lib/auth";
import { UserNotFoundException } from "../../lib/errors";
import { publish, publishAll } from "../../lib/queue";
import { EvaluationStatusEnum, getEvaluationStatusEnumByKey } from "../../enums/EvaluationStatusEnum";
import * as EvaluationStatusService from "../evaluationstatus/EvaluationStatusService";
import type { EvaluationDTO } from "../evaluation/dto/EvaluationDTO";
import * as EvaluationService from "../evaluation/serivce/EvaluationService";
import * as AbstractScoreQueueService from "../job/AbstractScoreQueueService";

export async function sendToQueue(ctx: Ctx, evaluationDTO: EvaluationDTO, _isBulk: boolean): Promise<void> {
  await publish(ctx.env, "heuristic-eval", evaluationDTO);
}

/** Batched publish (Queue.sendBatch, 100 per call) used by EvaluationBatchService. */
export async function sendAllToQueue(ctx: Ctx, evaluationDTOs: EvaluationDTO[]): Promise<void> {
  if (evaluationDTOs.length) await publishAll(ctx.env, "heuristic-eval", evaluationDTOs);
}

/**
 * Worker for one `heuristic-eval` message (@CheckJobActive). Status IN_PROGRESS → SUCCESSFUL or
 * FAILED ("Heuristic evaluation error: <message>"), updated by (evaluator, chat turn, job, user).
 */
export async function process(ctx: Ctx, evaluationDTO: EvaluationDTO): Promise<void> {
  await checkJobActive(ctx, evaluationDTO);
  try {
    const currentEvaluationStatus = await EvaluationStatusService.findById(ctx, evaluationDTO.evaluationStatusId as string);
    if (getEvaluationStatusEnumByKey(currentEvaluationStatus.status) === EvaluationStatusEnum.STOPPED) {
      console.info(
        `Skipping processing for Heuristic Evaluation (id: ${currentEvaluationStatus.id}), because its status is STOPPED.`,
      );
      return;
    }
    await EvaluationStatusService.updateEvaluationStatusFromDTO(
      ctx,
      evaluationDTO,
      EvaluationStatusEnum.IN_PROGRESS,
      "Heuristic evaluation in-progress.",
    );
    const user = await findUserById(ctx.db, evaluationDTO.userId as string);
    if (!user) throw new UserNotFoundException();
    await EvaluationService.runPointwiseHeuristicEval(
      { ...ctx, user },
      evaluationDTO.evaluatorId as string,
      user,
      evaluationDTO.chatTurnId as string,
      currentEvaluationStatus,
    );
    await EvaluationStatusService.updateEvaluationStatusFromDTO(
      ctx,
      evaluationDTO,
      EvaluationStatusEnum.SUCCESSFUL,
      "Heuristic evaluation successfully done.",
    );
    await AbstractScoreQueueService.trackJobStatus(ctx, evaluationDTO);
  } catch (e) {
    console.error(`Heuristic evaluation failed due to Exception: ${(e as Error).message}`);
    await EvaluationStatusService.updateEvaluationStatusFromDTO(
      ctx,
      evaluationDTO,
      EvaluationStatusEnum.FAILED,
      `Heuristic evaluation error: ${(e as Error).message}`,
    );
    await AbstractScoreQueueService.trackJobStatus(ctx, evaluationDTO);
  }
}
