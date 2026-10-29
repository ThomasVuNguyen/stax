/** Port of domain/evaluator/pairwise/PairwiseLLMEvaluatorController (`/pairwise-llm-evaluators`). */
import { Hono } from "hono";
import type { AppEnv } from "../../../env";
import { ScoreTypeValues } from "../../../enums/ScoreType";
import { currentUser } from "../../../lib/auth";
import { ctxFromHono } from "../../../lib/ctx";
import { bindEnum, requiredJsonBody } from "../../model/dto/jsonBinding";
import * as PairwiseLLMEvaluatorRequestDTO from "./dto/PairwiseLLMEvaluatorRequestDTO";
import * as PairwiseLLMEvaluatorService from "./service/PairwiseLLMEvaluatorService";

const app = new Hono<AppEnv>();
const REQUEST_TYPE = "com.planck.planck.domain.evaluator.pairwise.dto.PairwiseLLMEvaluatorRequestDTO";

async function readRequest(c: Parameters<typeof requiredJsonBody>[0]) {
  const body = await requiredJsonBody(c, REQUEST_TYPE);
  return {
    ...body,
    output_format_type: bindEnum(body.output_format_type, ScoreTypeValues, "com.planck.planck.enums.ScoreType"),
  } as PairwiseLLMEvaluatorRequestDTO.PairwiseLLMEvaluatorRequestDTO;
}

app.post("/pairwise-llm-evaluators", async (c) => {
  const request = await readRequest(c);
  PairwiseLLMEvaluatorRequestDTO.validate(request);
  return c.json(await PairwiseLLMEvaluatorService.createPairwiseLLMEvaluator(ctxFromHono(c), request, currentUser(c)), 201);
});

app.get("/pairwise-llm-evaluators", async (c) => {
  return c.json(await PairwiseLLMEvaluatorService.getEvaluatorByUserOrSystemType(ctxFromHono(c), currentUser(c)), 200);
});

app.get("/pairwise-llm-evaluators/:evaluatorId", async (c) => {
  return c.json(
    await PairwiseLLMEvaluatorService.getEvaluatorById(ctxFromHono(c), currentUser(c), c.req.param("evaluatorId")),
    200,
  );
});

/** Partial update; the body is not validated. */
app.patch("/pairwise-llm-evaluators/:evaluatorId", async (c) => {
  const request = await readRequest(c);
  return c.json(
    await PairwiseLLMEvaluatorService.updatePairwiseLLMEvaluator(ctxFromHono(c), currentUser(c), c.req.param("evaluatorId"), request),
    200,
  );
});

app.delete("/pairwise-llm-evaluators/:evaluatorId", async (c) => {
  await PairwiseLLMEvaluatorService.removePairwiseLLMEvaluatorById(ctxFromHono(c), currentUser(c), c.req.param("evaluatorId"));
  return c.body(null, 204);
});

export default app;
