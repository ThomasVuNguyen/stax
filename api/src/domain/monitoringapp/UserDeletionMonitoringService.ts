/** Port of monitoringapp/UserDeletionMonitoringService + UserDeletionMonitoringServiceImpl. */
import type { Ctx } from "../../lib/ctx";
import { RuntimeException } from "../../lib/errors";
import type { User } from "../../entities/User";
import * as UserDeletionJobQueueService from "../pubsub/UserDeletionJobQueueService";
import { staleThreshold } from "../user/UserDeletionService";
import * as UserDeletionStatusRepository from "../user/UserDeletionStatusRepository";
import * as UserRepository from "../user/UserRepository";
import * as UserDeletionNotificationService from "./notifications/UserDeletionNotificationService";

export async function checkForStaleUserDeletions(ctx: Ctx): Promise<void> {
  console.info("Checking for stale user deletions...");
  const staleUserDeletions = await UserDeletionStatusRepository.findStaleUserDeletions(ctx.db, staleThreshold());
  console.info(`Found ${staleUserDeletions.length} stale user deletions`);
  await UserDeletionNotificationService.sendStaleUserDeletionNotification(staleUserDeletions);
  console.info("Stale user deletion check completed");
}

export async function retryStaleUserDeletions(ctx: Ctx): Promise<void> {
  console.info("Retrying stale user deletions...");
  const staleUserDeletions = await UserDeletionStatusRepository.findStaleUserDeletions(ctx.db, staleThreshold());
  for (const staleUserDeletion of staleUserDeletions) {
    try {
      const user = await UserRepository.findById(ctx.db, staleUserDeletion.userId!);
      if (user == null) {
        console.warn(`User with id ${staleUserDeletion.userId} was not found`);
        continue;
      }
      await publishUserDeletionDirectly(ctx, user);
    } catch (e) {
      console.error(`Failed to retry user deletion for user ID: ${staleUserDeletion.userId}`, e);
    }
  }
}

async function publishUserDeletionDirectly(ctx: Ctx, user: User): Promise<void> {
  try {
    const userDeletionDTO = await UserDeletionJobQueueService.createUserDeletionMessage(ctx, user);
    await UserDeletionJobQueueService.sendUserDeletionMessage(ctx, userDeletionDTO);
  } catch (e) {
    console.error(`Failed to publish user deletion message directly for user: ${user.id}`, e);
    throw new RuntimeException("Failed to publish user deletion message", { cause: e });
  }
}
