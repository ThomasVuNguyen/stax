/** Port of domain/evaluator/EvaluatorController (`/evaluator`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { EvaluationType } from "../../enums/EvaluationType";
import { currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import type { AllEvaluatorsResponseDTO } from "./dto/AllEvaluatorsResponseDTO";
import * as PointwiseHeuristicEvaluatorService from "./heuristic/service/PointwiseHeuristicEvaluatorService";
import { fromPairwiseLLMEvaluator } from "./llm/dto/LLMEvaluatorResponseDTO";
import * as NewLLMEvaluatorService from "./llm/service/NewLLMEvaluatorService";
import * as PairwiseLLMEvaluatorService from "./pairwise/service/PairwiseLLMEvaluatorService";

const app = new Hono<AppEnv>();

/**
 * User + system LLM evaluators and the user's heuristic evaluators; non-deprecated pairwise
 * evaluators are appended (as `evaluation_type: SXS`) unless `evaluation_type` is given and is not "SXS".
 */
app.get("/evaluator/all", async (c) => {
  const ctx = ctxFromHono(c);
  const user = currentUser(c);
  const evaluationType = c.req.query("evaluation_type");
  const heuristic = await PointwiseHeuristicEvaluatorService.getEvaluatorsByUser(ctx, user);
  const llm = [
    ...(await NewLLMEvaluatorService.getEvaluatorByUser(ctx, user)),
    ...(await NewLLMEvaluatorService.getEvaluatorBySystemType(ctx)),
  ];
  if (evaluationType === undefined || evaluationType === EvaluationType.SXS) {
    const pairwise = (await PairwiseLLMEvaluatorService.getAllPairwiseLLMEvaluators(ctx, user)).filter((e) => !e.deprecated);
    const { models, inputs } = await PairwiseLLMEvaluatorService.loadModelsAndInputs(ctx, pairwise);
    llm.push(...pairwise.map((e) => fromPairwiseLLMEvaluator(e, models.get(e.modelId) ?? null, inputs.get(e.id as string) ?? [])));
  }
  const body: AllEvaluatorsResponseDTO = { llm, heuristic };
  return c.json(body, 200);
});

export default app;
