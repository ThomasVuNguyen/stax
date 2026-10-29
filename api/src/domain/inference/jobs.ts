/**
 * Port of the Pub/Sub listeners in config/PubSubInferenceConfig: every per-provider (and bulk)
 * subscription called `inferenceService.process(InferenceDTO)` after acking the message. They are
 * one `inference` queue job here. The @CheckJobActive aspect on process() is applied explicitly:
 * a missing or STOPPED job throws JobStatusStoppedException and the message is dropped (the
 * queue handler in src/index.ts logs it and acks, as the Java listener had already acked).
 */
import { findUserById } from "../../lib/auth";
import { ctxFromJob } from "../../lib/ctx";
import { registerJobHandler } from "../../lib/queue";
import * as JobStatusCheck from "../../aspect/JobStatusCheck";
import type { InferenceDTO } from "./dto/InferenceDTO";
import * as InferenceService from "./service/InferenceService";

registerJobHandler<InferenceDTO>("inference", async (payload, env, exec) => {
  // Not needed by process() (it loads the user from the DTO), but lets callees that read ctx.user work.
  const user = payload.user_id ? await findUserById(env.DB, payload.user_id) : null;
  const ctx = ctxFromJob(env, exec, user);
  console.info(`Inference message arrived for chat turn ${payload.chat_turn_id} (job ${payload.job_id})`);
  await JobStatusCheck.checkJobActive(ctx, payload);
  await InferenceService.process(ctx, payload);
});
