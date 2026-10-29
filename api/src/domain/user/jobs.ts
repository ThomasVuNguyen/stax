/**
 * Port of the `user-deletion` Pub/Sub subscriber (config/PubSubUserDeletionConfig). The Java
 * listener used manual acks and did not ack a failed message, so Pub/Sub redelivered it; the queue
 * consumer always acks, so a failed step is re-sent here with a delay instead.
 */
import { ctxFromJob } from "../../lib/ctx";
import { registerJobHandler } from "../../lib/queue";
import * as UserDeletionJobQueueService from "../pubsub/UserDeletionJobQueueService";
import type { UserDeletionDTO } from "./dto/UserDeletionDTO";

const REDELIVERY_DELAY_SECONDS = 30;

registerJobHandler<UserDeletionDTO>("user-deletion", async (payload, env, exec) => {
  const ctx = ctxFromJob(env, exec);
  try {
    await UserDeletionJobQueueService.processUserDeletion(ctx, payload);
    console.info(`User deletion message processed and acknowledged for user: ${payload.user_id}`);
  } catch (e) {
    console.error("Failed to process user deletion message", e);
    await env.JOBS.send({ kind: "user-deletion", payload }, { delaySeconds: REDELIVERY_DELAY_SECONDS });
  }
});
