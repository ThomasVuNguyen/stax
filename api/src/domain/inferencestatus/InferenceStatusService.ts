/**
 * Port of domain/inferencestatus/InferenceStatusService(+Impl).
 *
 * Overloads:
 * - `updateInferenceStatus(ctx, dto, statusEnum, comment)` (per chat turn/job/user) and
 *   `updateInferenceStatus(ctx, newStatus, jobId, comment, oldStatus)` (whole job, returns the
 *   number of updated rows) share the Java name; the function dispatches on the 2nd argument.
 *   The job-level form is also exported as `updateInferenceStatusByJobId`.
 *
 * Extra (not in Java): `createOrUpdateInferenceStatuses(ctx, dtos, statusEnum)`, the batched form
 * of createOrUpdateInferenceStatus used by the bulk publishers to stay within D1 query limits.
 */
import type { Ctx } from "../../lib/ctx";
import { now } from "../../lib/db";
import { IllegalInputException, IllegalStateException, NotFoundException } from "../../lib/errors";
import * as InferenceStatusEntity from "../../entities/InferenceStatus";
import type { InferenceStatus } from "../../entities/InferenceStatus";
import type { User } from "../../entities/User";
import {
  InferenceStatusEnum,
  getInferenceStatusEnumByKey,
  getKey,
} from "../../enums/InferenceStatusEnum";
import * as InferenceStatusRepository from "./InferenceStatusRepository";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import { type InferenceDTO, toString as dtoToString } from "../inference/dto/InferenceDTO";

const INFERENCES_FAILED = "Jobs-Failed";
const INFERENCES_STOPPED = "Jobs-Stopped";
const INFERENCES_SUCCESSFUL = "Jobs-Successful";
const INFERENCES_IN_PROGRESS = "Jobs-In-Progress";
const INFERENCES_PENDING = "Jobs-Pending";

function getTrimmedReason(reason: string | null | undefined): string | null {
  if (reason == null) return null;
  return reason.length > 3999 ? reason.substring(0, 3999) : reason;
}

function applyDto(s: InferenceStatus, dto: InferenceDTO, e: InferenceStatusEnum): void {
  s.status = getKey(e);
  s.jobId = dto.job_id;
  s.comments = dto.comments;
  if (dto.reason != null && dto.reason !== "") s.reason = getTrimmedReason(dto.reason);
}

export async function createOrUpdateInferenceStatus(
  ctx: Ctx,
  inferenceDTO: InferenceDTO,
  inferenceStatusEnum: InferenceStatusEnum,
): Promise<InferenceStatus> {
  console.info(`Create inference status request :: ${dtoToString(inferenceDTO)}`);
  const existing = await InferenceStatusRepository.getByChatTurnId(
    ctx.db,
    inferenceDTO.chat_turn_id as string,
    inferenceDTO.user_id as string,
  );
  let inferenceStatus: InferenceStatus;
  if (existing) {
    inferenceStatus = existing;
    inferenceStatus.createdAt = now();
  } else {
    const chatTurn = inferenceDTO.chat_turn_id
      ? await ChatTurnRepository.findById(ctx.db, inferenceDTO.chat_turn_id)
      : null;
    if (!chatTurn) throw new IllegalInputException("Chat turn not found");
    inferenceStatus = InferenceStatusEntity.create({
      chatTurnId: chatTurn.id,
      userId: inferenceDTO.user_id,
      containerId: inferenceDTO.project_id,
    });
  }
  applyDto(inferenceStatus, inferenceDTO, inferenceStatusEnum);
  return InferenceStatusRepository.save(ctx.db, inferenceStatus);
}

/**
 * Batched createOrUpdateInferenceStatus over many DTOs (same semantics, applied in list order):
 * one lookup for existing rows, one for the chat turns, batched upserts. Sets
 * `inference_status_id` on every DTO (like InferencePreparationService.createInferenceStatus).
 * DTOs whose chat turn does not exist are skipped and returned in `missing`.
 */
export async function createOrUpdateInferenceStatuses(
  ctx: Ctx,
  dtos: InferenceDTO[],
  inferenceStatusEnum: InferenceStatusEnum,
): Promise<{ statuses: InferenceStatus[]; missing: InferenceDTO[] }> {
  const turnIds = [...new Set(dtos.map((d) => d.chat_turn_id).filter((id): id is string => !!id))];
  const existing = await InferenceStatusRepository.findAllByChatTurnIdIn(ctx.db, turnIds);
  const byKey = new Map<string, InferenceStatus>(existing.map((s) => [`${s.chatTurnId}|${s.userId}`, s]));
  const needTurn = [
    ...new Set(
      dtos
        .filter((d) => d.chat_turn_id && !byKey.has(`${d.chat_turn_id}|${d.user_id}`))
        .map((d) => d.chat_turn_id as string),
    ),
  ];
  const turnsFound = new Set(
    (needTurn.length ? await ChatTurnRepository.findAllById(ctx.db, needTurn) : []).map((t) => t.id),
  );

  const toSave = new Map<InferenceStatus, true>();
  const missing: InferenceDTO[] = [];
  for (const dto of dtos) {
    const key = `${dto.chat_turn_id}|${dto.user_id}`;
    let s = byKey.get(key);
    if (s) {
      s.createdAt = now();
    } else {
      if (!dto.chat_turn_id || !turnsFound.has(dto.chat_turn_id)) {
        missing.push(dto);
        continue;
      }
      s = InferenceStatusEntity.create({ chatTurnId: dto.chat_turn_id, userId: dto.user_id, containerId: dto.project_id });
      InferenceStatusEntity.prePersist(s);
      byKey.set(key, s);
    }
    applyDto(s, dto, inferenceStatusEnum);
    dto.inference_status_id = s.id;
    toSave.set(s, true);
  }
  const statuses = [...toSave.keys()];
  await InferenceStatusRepository.saveAll(ctx.db, statuses);
  return { statuses, missing };
}

/** updateInferenceStatus(InferenceDTO, InferenceStatusEnum, String comment). */
async function updateInferenceStatusForDto(
  ctx: Ctx,
  inferenceDTO: InferenceDTO,
  inferenceStatusEnum: InferenceStatusEnum,
  comment: string | null,
): Promise<void> {
  console.info(
    `Update inference status request :: InferenceDTO=${dtoToString(inferenceDTO)}, statusEnum=${inferenceStatusEnum}, comment=${comment}`,
  );
  await InferenceStatusRepository.updateStatusByChatTurnIdAndJobIdAndUserId(
    ctx.db,
    getKey(inferenceStatusEnum),
    inferenceDTO.chat_turn_id as string,
    inferenceDTO.job_id as string,
    inferenceDTO.user_id as string,
    comment,
    getTrimmedReason(inferenceDTO.reason),
  );
  console.info("Inference status updated successfully");
}

/** updateInferenceStatus(newStatus, jobId, comment, oldStatus): returns the number of updated rows. */
export async function updateInferenceStatusByJobId(
  ctx: Ctx,
  newInferenceStatus: InferenceStatusEnum,
  jobId: string,
  comment: string | null,
  oldInferenceStatus: InferenceStatusEnum,
): Promise<number> {
  return InferenceStatusRepository.updateStatusByJobIdAndUserId(
    ctx.db,
    getKey(newInferenceStatus),
    jobId,
    comment,
    getKey(oldInferenceStatus),
  );
}

export function updateInferenceStatus(
  ctx: Ctx,
  inferenceDTO: InferenceDTO,
  inferenceStatusEnum: InferenceStatusEnum,
  comment: string | null,
): Promise<void>;
export function updateInferenceStatus(
  ctx: Ctx,
  newInferenceStatus: InferenceStatusEnum,
  jobId: string,
  comment: string | null,
  oldInferenceStatus: InferenceStatusEnum,
): Promise<number>;
export function updateInferenceStatus(
  ctx: Ctx,
  a: InferenceDTO | InferenceStatusEnum,
  b: InferenceStatusEnum | string,
  comment: string | null,
  oldInferenceStatus?: InferenceStatusEnum,
): Promise<void | number> {
  if (typeof a === "string") {
    return updateInferenceStatusByJobId(ctx, a, b as string, comment, oldInferenceStatus as InferenceStatusEnum);
  }
  return updateInferenceStatusForDto(ctx, a, b as InferenceStatusEnum, comment);
}

/** Counts of the job's inference statuses by state; empty object when the job has none. */
export async function findAllByUserAndJobId(
  ctx: Ctx,
  jobId: string | null,
  userId: string | null,
): Promise<Record<string, number>> {
  console.info(`Get inference status by userId ${userId} and jobId :: ${jobId} `);
  const statuses = await InferenceStatusRepository.findAllByJobIdAndUserId(ctx.db, jobId as string, userId as string);
  const out: Record<string, number> = {};
  if (statuses.length === 0) {
    console.info(`No Inference Status found for jobId: ${jobId} and userId: ${userId}`);
    return out;
  }
  const count = (e: InferenceStatusEnum) => statuses.filter((s) => s.status === getKey(e)).length;
  out[INFERENCES_IN_PROGRESS] = count(InferenceStatusEnum.IN_PROGRESS);
  out[INFERENCES_PENDING] = count(InferenceStatusEnum.PENDING);
  out[INFERENCES_SUCCESSFUL] = count(InferenceStatusEnum.SUCCESSFUL);
  out[INFERENCES_FAILED] = count(InferenceStatusEnum.FAILED);
  out[INFERENCES_STOPPED] = count(InferenceStatusEnum.STOPPED);
  return out;
}

export async function findByChatTurnIdAndUser(
  ctx: Ctx,
  chatTurnId: string | null,
  userId: string | null,
): Promise<InferenceStatus> {
  const s = await InferenceStatusRepository.getByChatTurnId(ctx.db, chatTurnId as string, userId as string);
  if (!s) throw new NotFoundException(`InferenceStatus not found for chatTurnId: ${chatTurnId}`);
  return s;
}

export async function stopInferenceStatusByChatTurnIdAndProjectId(
  ctx: Ctx,
  chatTurnId: string,
  containerId: string,
  user: Pick<User, "id">,
): Promise<void> {
  const inferenceStatus = await InferenceStatusRepository.getByChatTurnId(ctx.db, chatTurnId, user.id as string);
  if (!inferenceStatus) throw new NotFoundException(`InferenceStatus not found for chatTurnId: ${chatTurnId}`);
  if (inferenceStatus.containerId !== containerId) throw new NotFoundException("InferenceStatus not found");

  const current = getInferenceStatusEnumByKey(inferenceStatus.status);
  const finalStatuses: (InferenceStatusEnum | null)[] = [
    InferenceStatusEnum.SUCCESSFUL,
    InferenceStatusEnum.FAILED,
    InferenceStatusEnum.STOPPED,
  ];
  if (finalStatuses.includes(current)) {
    throw new IllegalStateException("Inference task is already in a final state");
  }
  inferenceStatus.status = getKey(InferenceStatusEnum.STOPPED);
  inferenceStatus.comments = "Inference has been stopped manually";
  await InferenceStatusRepository.save(ctx.db, inferenceStatus);
}
