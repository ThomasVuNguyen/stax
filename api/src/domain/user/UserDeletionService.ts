/**
 * Port of user/UserDeletionService + UserDeletionServiceImpl.
 * D1 has no transactions: the steps of deleteUserAndAllData run sequentially and are not rolled
 * back when a later step fails; the failure is recorded on the user_deletion_status row instead.
 */
import type { Ctx } from "../../lib/ctx";
import { now } from "../../lib/db";
import { ResourceDeletionException } from "../../lib/errors";
import { UserStatus } from "../../enums/UserStatus";
import type { User } from "../../entities/User";
import * as UserDeletionStatusEntity from "../../entities/UserDeletionStatus";
import type { UserDeletionStatus } from "../../entities/UserDeletionStatus";
import * as ApiKeysService from "../apikeys/service/ApiKeysService";
import * as JobStatusService from "../job/JobStatusService";
import * as UserDeletionJobQueueService from "../pubsub/UserDeletionJobQueueService";
import * as UserDeletionStatusRepository from "./UserDeletionStatusRepository";
import * as UserRepository from "./UserRepository";

export async function deleteUserAndAllData(ctx: Ctx, user: User): Promise<void> {
  let userDeletionStatus: UserDeletionStatus | null = null;
  try {
    console.info(`Deleting user ${user.id} and all related data`);
    userDeletionStatus = UserDeletionStatusEntity.create({ userId: user.id, requestTimestamp: now() });
    await UserDeletionStatusRepository.saveAndFlush(ctx.db, userDeletionStatus);
    await updateUserStatusToPendingDeletion(ctx, user);
    await ApiKeysService.deleteByUser(ctx, user);
    await JobStatusService.stopAllJobsByUser(ctx, user);
    await UserDeletionJobQueueService.publishUserDeletion(ctx, user);
    console.info(`User ${user.id} scheduled for deletion`);
  } catch (e) {
    console.error(`Error deleting user ${user.id}: ${(e as Error).message}`, e);
    if (userDeletionStatus != null) {
      await updateFailureStatus(ctx, userDeletionStatus, "INITIALIZATION", (e as Error).message);
    }
    throw new ResourceDeletionException("User", user.id ?? "null", "Failed to trigger user deletion");
  }
}

export async function publishUserDeletion(ctx: Ctx, user: User): Promise<void> {
  await UserDeletionJobQueueService.publishUserDeletion(ctx, user);
}

export async function updateFailureStatus(
  ctx: Ctx,
  userDeletionStatus: UserDeletionStatus,
  failureStep: string,
  failureMessage: string,
): Promise<void> {
  try {
    userDeletionStatus.lastFailureStep = failureStep;
    userDeletionStatus.lastFailureMessage = failureMessage;
    await UserDeletionStatusRepository.save(ctx.db, userDeletionStatus);
    console.error(
      `Updated failure status for user: ${userDeletionStatus.userId}, step: ${failureStep}, error: ${failureMessage}`,
    );
  } catch (saveException) {
    console.error(`Failed to update failure status for user: ${userDeletionStatus.userId}`, saveException);
  }
}

export async function updateUserStatusToPendingDeletion(ctx: Ctx, user: User): Promise<void> {
  console.info(`Updating user ${user.id} status to PENDING_DELETION`);
  user.status = UserStatus.PENDING_DELETION;
  await UserRepository.saveAndFlush(ctx.db, user);
}

export async function getStaleUserDeletionCount(ctx: Ctx): Promise<number> {
  return (await getStaleUserDeletions(ctx)).length;
}

/** `Date.valueOf(LocalDate.now().minus(7, DAYS))`: midnight (UTC) seven days ago. */
export function staleThreshold(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

async function getStaleUserDeletions(ctx: Ctx): Promise<UserDeletionStatus[]> {
  return UserDeletionStatusRepository.findStaleUserDeletions(ctx.db, staleThreshold());
}

export async function retryStaleUserDeletions(ctx: Ctx): Promise<void> {
  for (const status of await getStaleUserDeletions(ctx)) {
    try {
      console.info(`Retrying deletion for user: ${status.userId}`);
      const user = await UserRepository.findById(ctx.db, status.userId!);
      if (user == null) {
        console.warn(`User with id ${status.userId} was not found`);
        continue;
      }
      await UserDeletionJobQueueService.publishUserDeletion(ctx, user);
    } catch (e) {
      console.error(`Failed to retry deletion for user: ${status.userId}`, e);
    }
  }
}
