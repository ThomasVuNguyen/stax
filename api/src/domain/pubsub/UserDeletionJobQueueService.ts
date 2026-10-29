/**
 * Port of domain/pubsub/UserDeletionJobQueueService.
 *
 * The Pub/Sub topic is the `user-deletion` kind of the shared queue (handler in
 * domain/user/jobs.ts). Each message deletes the user's rows of the first table in
 * `deletion_steps` (order from server/src/main/resources/entity_deletion_order.json, in batches of
 * 1000) and publishes the remaining steps. A failed step is recorded on user_deletion_status and
 * rethrown so the handler can redeliver it (Pub/Sub nack); after MAX_STEP_RETRIES it stops.
 */
import type { Ctx } from "../../lib/ctx";
import { publish } from "../../lib/queue";
import { RuntimeException } from "../../lib/errors";
import { now } from "../../lib/db";
import * as UserDeletionStatusEntity from "../../entities/UserDeletionStatus";
import type { UserDeletionStatus } from "../../entities/UserDeletionStatus";
import entityDeletionOrder from "../../../../server/src/main/resources/entity_deletion_order.json";
import * as UserDataDeletionRepository from "../user/UserDataDeletionRepository";
import * as UserDeletionStatusRepository from "../user/UserDeletionStatusRepository";
import type { DeletionStep, UserDeletionDTO } from "../user/dto/UserDeletionDTO";

export const MAX_STEP_RETRIES = 10;
const BATCH_SIZE = 1000;

export async function publishUserDeletion(ctx: Ctx, user: { id: string | null }): Promise<void> {
  try {
    const userDeletionDTO = await createUserDeletionMessage(ctx, user);
    await sendUserDeletionMessage(ctx, userDeletionDTO);
  } catch (e) {
    console.error(`Failed to publish user deletion message for user: ${user.id}`, e);
    throw new RuntimeException("Failed to publish user deletion message", { cause: e });
  }
}

export async function createUserDeletionMessage(ctx: Ctx, user: { id: string | null }): Promise<UserDeletionDTO> {
  const deletionSteps = createDeletionSteps();
  const userDeletionStatus = await getUserDeletionStatus(ctx, user.id!);
  userDeletionStatus.completedSteps = 0;
  userDeletionStatus.totalSteps = deletionSteps.length;
  userDeletionStatus.lastStepRetries = 0;
  await UserDeletionStatusRepository.save(ctx.db, userDeletionStatus);
  return { request_id: userDeletionStatus.requestId, user_id: user.id, deletion_steps: deletionSteps };
}

/** Publishes a UserDeletionDTO on the `user-deletion` queue. */
export async function sendUserDeletionMessage(ctx: Ctx, userDeletionDTO: UserDeletionDTO): Promise<void> {
  await publish(ctx.env, "user-deletion", userDeletionDTO);
  console.info(
    `User deletion message published for user: ${userDeletionDTO.user_id}, requestId: ${userDeletionDTO.request_id}`,
  );
}

export function createDeletionSteps(): DeletionStep[] {
  try {
    const steps = (entityDeletionOrder as { table_name: string }[]).map((s) => ({ table_name: s.table_name }));
    console.info(`Loaded ${steps.length} deletion steps from entity_deletion_order.json`);
    return steps;
  } catch (e) {
    console.error("Failed to parse entity_deletion_order.json", e);
    throw new RuntimeException("Failed to parse entity_deletion_order.json", { cause: e });
  }
}

export async function processUserDeletion(ctx: Ctx, userDeletionDTO: UserDeletionDTO): Promise<void> {
  const userId = userDeletionDTO.user_id!;
  const userDeletionStatus = await getUserDeletionStatus(ctx, userId);
  const currentStep = userDeletionDTO.deletion_steps?.length ? userDeletionDTO.deletion_steps[0] : null;
  if (currentStep == null) {
    console.info(`All deletion steps completed for user: ${userId}, requestId: ${userDeletionDTO.request_id}`);
    return;
  }
  try {
    await processDeletionStep(ctx, userDeletionDTO, currentStep, userDeletionStatus);
    await updateDeletionStatusOnSuccess(ctx, userDeletionStatus, userDeletionDTO);
    await publishNextDeletionMessage(ctx, userDeletionDTO);
  } catch (e) {
    const currentTableName = currentStep.table_name ?? "unknown";
    console.error(
      `Failed to process user deletion for user: ${userId}, requestId: ${userDeletionDTO.request_id}, table: ${currentTableName}`,
      e,
    );
    const currentRetryCount = await updateDeletionStatusOnStepFailure(
      ctx,
      userDeletionStatus,
      userDeletionDTO,
      currentTableName,
      e as Error,
    );
    if (currentRetryCount >= MAX_STEP_RETRIES) {
      console.error(
        `Maximum retries (${MAX_STEP_RETRIES}) reached for user deletion. Stopping processing for user: ${userId}, requestId: ${userDeletionDTO.request_id}. Manual intervention may be required.`,
      );
      return;
    }
    throw new RuntimeException("Failed to process user deletion", { cause: e });
  }
}

async function processDeletionStep(
  ctx: Ctx,
  userDeletionDTO: UserDeletionDTO,
  currentStep: DeletionStep,
  userDeletionStatus: UserDeletionStatus,
): Promise<void> {
  const stepId = (userDeletionStatus.completedSteps ?? 0) + 1;
  console.info(
    `Processing deletion step: ${currentStep.table_name} (stepId: ${stepId}) for user: ${userDeletionDTO.user_id}, requestId: ${userDeletionDTO.request_id}`,
  );
  const userId = userDeletionDTO.user_id!;
  const count = await UserDataDeletionRepository.countByTableAndUser(ctx.db, currentStep.table_name, userId);
  console.info(`Found ${count} records to delete for table ${currentStep.table_name} and user: ${userId}`);
  if (count > 0) await deleteRecordsInBatches(ctx, currentStep, userId, count);
}

async function deleteRecordsInBatches(ctx: Ctx, currentStep: DeletionStep, userId: string, totalCount: number) {
  const totalBatches = Math.ceil(totalCount / BATCH_SIZE);
  let totalDeleted = 0;
  for (let batchNum = 1; batchNum <= totalBatches; batchNum++) {
    try {
      const recordsInThisBatch = Math.min(BATCH_SIZE, totalCount - totalDeleted);
      totalDeleted += await executeBatchDeletionInTransaction(ctx, currentStep.table_name, userId, recordsInThisBatch);
    } catch (e) {
      throw new RuntimeException(
        `Failed to delete batch ${batchNum}/${totalBatches} for table ${currentStep.table_name}: ${(e as Error).message}`,
        { cause: e },
      );
    }
  }
  console.info(`Successfully deleted ${totalDeleted} records from table ${currentStep.table_name} for user: ${userId}`);
}

export async function executeBatchDeletionInTransaction(
  ctx: Ctx,
  tableName: string,
  userId: string,
  batchSize: number,
): Promise<number> {
  return UserDataDeletionRepository.deleteByTableAndUserWithLimit(ctx.db, tableName, userId, batchSize);
}

export async function updateDeletionStatusOnSuccess(
  ctx: Ctx,
  userDeletionStatus: UserDeletionStatus,
  userDeletionDTO: UserDeletionDTO,
): Promise<void> {
  userDeletionStatus.completedSteps = (userDeletionStatus.completedSteps ?? 0) + 1;
  userDeletionStatus.lastStepRetries = 0;
  await UserDeletionStatusRepository.save(ctx.db, userDeletionStatus);
  console.info(
    `Updated deletion status for user: ${userDeletionDTO.user_id}, requestId: ${userDeletionDTO.request_id}, completed steps: ${userDeletionStatus.completedSteps}`,
  );
}

export async function updateDeletionStatusOnStepFailure(
  ctx: Ctx,
  userDeletionStatus: UserDeletionStatus,
  _userDeletionDTO: UserDeletionDTO,
  failedTableName: string,
  e: Error,
): Promise<number> {
  userDeletionStatus.lastStepRetries = (userDeletionStatus.lastStepRetries ?? 0) + 1;
  const currentRetryCount = userDeletionStatus.lastStepRetries;
  userDeletionStatus.lastFailureStep = failedTableName;
  userDeletionStatus.lastFailureMessage = `Retry ${currentRetryCount}/${MAX_STEP_RETRIES}: ${e?.message ?? null}`;
  await UserDeletionStatusRepository.save(ctx.db, userDeletionStatus);
  return currentRetryCount;
}

async function publishNextDeletionMessage(ctx: Ctx, userDeletionDTO: UserDeletionDTO): Promise<void> {
  const remainingSteps = userDeletionDTO.deletion_steps.slice(1);
  if (remainingSteps.length === 0) {
    console.info(
      `All deletion steps completed for user: ${userDeletionDTO.user_id}, requestId: ${userDeletionDTO.request_id}. No more messages to send.`,
    );
    return;
  }
  await publish(ctx.env, "user-deletion", { ...userDeletionDTO, deletion_steps: remainingSteps });
  console.info(
    `Published next deletion message for user: ${userDeletionDTO.user_id}, requestId: ${userDeletionDTO.request_id}, remaining steps: ${remainingSteps.length}`,
  );
}

async function getUserDeletionStatus(ctx: Ctx, userId: string): Promise<UserDeletionStatus> {
  let userDeletionStatus = await UserDeletionStatusRepository.findByUserId(ctx.db, userId);
  if (userDeletionStatus == null) {
    console.info(`Creating new UserDeletionStatus for user: ${userId}`);
    userDeletionStatus = UserDeletionStatusEntity.create({ userId, requestTimestamp: now() });
    await UserDeletionStatusRepository.saveAndFlush(ctx.db, userDeletionStatus);
  }
  return userDeletionStatus;
}
