/**
 * Port of domain/evaluationstatus/EvaluationStatusService(+Impl).
 *
 * `updateEvaluationStatus` had three Java overloads; the exported function dispatches on its first
 * argument like Java overload resolution did:
 *   updateEvaluationStatus(ctx, evaluationStatus: EvaluationStatus, status, comment)          → void
 *   updateEvaluationStatus(ctx, evaluationDTO: EvaluationDTO, status, comment)                → void
 *   updateEvaluationStatus(ctx, newStatus: EvaluationStatusEnum, jobId, comment, oldStatus)   → number
 * The explicit variants are also exported: `updateEvaluationStatusEntity`,
 * `updateEvaluationStatusFromDTO`, `updateEvaluationStatusByJobId`.
 */
import type { Ctx } from "../../lib/ctx";
import { NotFoundException, RuntimeException } from "../../lib/errors";
import { type EvaluationStatus, create } from "../../entities/EvaluationStatus";
import {
  EvaluationStatusEnum,
  getEvaluationStatusEnumByKey,
  getKey,
  getValue,
} from "../../enums/EvaluationStatusEnum";
import { JOBS_FAILED, JOBS_IN_PROGRESS, JOBS_PENDING, JOBS_STOPPED, JOBS_SUCCESSFUL } from "../../util/PlanckConstants";
import type { EvaluationDTO } from "../evaluation/dto/EvaluationDTO";
import * as EvaluationStatusRepository from "./EvaluationStatusRepository";

type UserRef = { id: string | null };

/**
 * Returns the existing status for (evaluator, chat turn, user) or a new one, reset to PENDING with
 * the given container id.
 */
export async function createEvaluationStatus(
  ctx: Ctx,
  evaluatorId: string,
  chatTurnId: string,
  userId: string,
  projectId: string | null,
): Promise<EvaluationStatus> {
  const evaluationStatus =
    (await EvaluationStatusRepository.findByEvaluatorIdAndChatTurnIdAndUserId(ctx.db, evaluatorId, chatTurnId, userId)) ??
    create();
  evaluationStatus.evaluatorId = evaluatorId;
  evaluationStatus.chatTurnId = chatTurnId;
  evaluationStatus.userId = userId;
  evaluationStatus.status = getKey(EvaluationStatusEnum.PENDING);
  evaluationStatus.containerId = projectId;
  return EvaluationStatusRepository.saveAndFlush(ctx.db, evaluationStatus);
}

export async function updateEvaluationStatusFromDTO(
  ctx: Ctx,
  evaluationDTO: EvaluationDTO,
  status: EvaluationStatusEnum,
  comment: string | null,
): Promise<void> {
  await EvaluationStatusRepository.updateStatusByEvaluatorIdAndChatTurnIdAndJobIdAndUserId(
    ctx.db,
    getKey(status),
    evaluationDTO.evaluatorId as string,
    evaluationDTO.chatTurnId as string,
    evaluationDTO.jobId as string,
    evaluationDTO.userId as string,
    comment,
    evaluationDTO.reason,
  );
}

/** Java ran this in its own transaction (REQUIRES_NEW); D1 writes are immediate anyway. */
export async function updateEvaluationStatusEntity(
  ctx: Ctx,
  evaluationStatus: EvaluationStatus,
  status: EvaluationStatusEnum,
  comment: string | null,
): Promise<void> {
  evaluationStatus.status = getKey(status);
  evaluationStatus.comments = comment;
  await EvaluationStatusRepository.saveAndFlush(ctx.db, evaluationStatus);
}

/** Bulk status change of a job's statuses currently in `oldStatus`; returns the updated row count. */
export async function updateEvaluationStatusByJobId(
  ctx: Ctx,
  newStatus: EvaluationStatusEnum,
  jobId: string,
  comment: string | null,
  oldStatus: EvaluationStatusEnum,
): Promise<number> {
  return EvaluationStatusRepository.updateStatusByJobIdAndUserId(ctx.db, getKey(newStatus), jobId, comment, getKey(oldStatus));
}

export function updateEvaluationStatus(
  ctx: Ctx,
  evaluationStatus: EvaluationStatus,
  status: EvaluationStatusEnum,
  comment: string | null,
): Promise<void>;
export function updateEvaluationStatus(
  ctx: Ctx,
  evaluationDTO: EvaluationDTO,
  status: EvaluationStatusEnum,
  comment: string | null,
): Promise<void>;
export function updateEvaluationStatus(
  ctx: Ctx,
  newStatus: EvaluationStatusEnum,
  jobId: string,
  comment: string | null,
  oldStatus: EvaluationStatusEnum,
): Promise<number>;
export function updateEvaluationStatus(ctx: Ctx, a: any, b: any, c: any, d?: any): Promise<void | number> {
  if (typeof a === "string") return updateEvaluationStatusByJobId(ctx, a as EvaluationStatusEnum, b, c, d);
  if (a && typeof a === "object" && "status" in a) return updateEvaluationStatusEntity(ctx, a, b, c);
  return updateEvaluationStatusFromDTO(ctx, a, b, c);
}

/** Counts of the job's statuses keyed by PlanckConstants.JOBS_*; {} when the job has none. */
export async function findAllByUserAndJobId(ctx: Ctx, jobId: string, userId: string): Promise<Record<string, number>> {
  const statuses = await EvaluationStatusRepository.findAllByJobIdAndUserId(ctx.db, jobId, userId);
  if (!statuses.length) return {};
  const count = (s: EvaluationStatusEnum) => statuses.filter((e) => e.status === getKey(s)).length;
  return {
    [JOBS_IN_PROGRESS]: count(EvaluationStatusEnum.IN_PROGRESS),
    [JOBS_PENDING]: count(EvaluationStatusEnum.PENDING),
    [JOBS_SUCCESSFUL]: count(EvaluationStatusEnum.SUCCESSFUL),
    [JOBS_FAILED]: count(EvaluationStatusEnum.FAILED),
    [JOBS_STOPPED]: count(EvaluationStatusEnum.STOPPED),
  };
}

export async function findById(ctx: Ctx, evaluationStatusId: string): Promise<EvaluationStatus> {
  const status = await EvaluationStatusRepository.findById(ctx.db, evaluationStatusId);
  if (!status) throw new NotFoundException("EvaluationStatus not found");
  return status;
}

/** Marks a non-final status STOPPED. IllegalStateException surfaced as 500 RUNTIME_ERROR. */
export async function stopEvaluation(ctx: Ctx, evaluationStatusId: string, _projectId: string | null, user: UserRef): Promise<void> {
  const evaluationStatus = await EvaluationStatusRepository.findById(ctx.db, evaluationStatusId);
  if (!evaluationStatus) throw new NotFoundException(`EvaluationStatus not found for id: ${evaluationStatusId}`);
  if (evaluationStatus.userId !== user.id) throw new NotFoundException("EvaluationStatus not found.");
  const currentStatus = getEvaluationStatusEnumByKey(evaluationStatus.status);
  const finalStatuses: (EvaluationStatusEnum | null)[] = [
    EvaluationStatusEnum.SUCCESSFUL,
    EvaluationStatusEnum.FAILED,
    EvaluationStatusEnum.STOPPED,
  ];
  if (currentStatus && finalStatuses.includes(currentStatus)) {
    throw new RuntimeException(`Evaluation task is already in a final state: ${getValue(currentStatus)}`);
  }
  evaluationStatus.status = getKey(EvaluationStatusEnum.STOPPED);
  evaluationStatus.comments = "Evaluation has been stopped manually by user.";
  await EvaluationStatusRepository.save(ctx.db, evaluationStatus);
}
