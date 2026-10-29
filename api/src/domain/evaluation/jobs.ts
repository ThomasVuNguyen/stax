/**
 * Queue listeners of config/PubSubEvalConfig: every per-provider eval subscription (and its bulk
 * twin) feeds `llm-eval`; the heuristic subscriptions feed `heuristic-eval`. Payload: EvaluationDTO.
 */
import { ctxFromJob } from "../../lib/ctx";
import { registerJobHandler } from "../../lib/queue";
import * as LLMScoreQueueService from "../pubsub/LLMScoreQueueService";
import * as PointwiseHeuristicEvaluationScoreQueueService from "../pubsub/PointwiseHeuristicEvaluationScoreQueueService";
import type { EvaluationDTO } from "./dto/EvaluationDTO";

registerJobHandler<EvaluationDTO>("llm-eval", async (payload, env, exec) => {
  await LLMScoreQueueService.process(ctxFromJob(env, exec), payload);
});

registerJobHandler<EvaluationDTO>("heuristic-eval", async (payload, env, exec) => {
  await PointwiseHeuristicEvaluationScoreQueueService.process(ctxFromJob(env, exec), payload);
});
