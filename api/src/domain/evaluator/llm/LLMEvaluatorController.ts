/** Port of domain/evaluator/llm/LLMEvaluatorController (`/llm_evaluator`). */
import { Hono } from "hono";
import type { AppEnv } from "../../../env";
import { ScoreTypeValues } from "../../../enums/ScoreType";
import { currentUser } from "../../../lib/auth";
import { ctxFromHono } from "../../../lib/ctx";
import { bindEnum, requiredJsonBody } from "../../model/dto/jsonBinding";
import * as LLMEvaluatorRequestDTO from "./dto/LLMEvaluatorRequestDTO";
import * as LLMEvaluatorUpdateDTO from "./dto/LLMEvaluatorUpdateDTO";
import * as NewLLMEvaluatorService from "./service/NewLLMEvaluatorService";

const app = new Hono<AppEnv>();
const SCORE_TYPE = "com.planck.planck.enums.ScoreType";

// Literal routes before `/:evaluatorId`.
app.get("/llm_evaluator/custom", async (c) => {
  return c.json(await NewLLMEvaluatorService.getEvaluatorByUser(ctxFromHono(c), currentUser(c)), 200);
});

app.get("/llm_evaluator/system", async (c) => {
  return c.json(await NewLLMEvaluatorService.getEvaluatorBySystemType(ctxFromHono(c)), 200);
});

app.get("/llm_evaluator/:evaluatorId", async (c) => {
  return c.json(await NewLLMEvaluatorService.getEvaluatorById(ctxFromHono(c), currentUser(c), c.req.param("evaluatorId")), 200);
});

app.get("/llm_evaluator", async (c) => {
  return c.json(await NewLLMEvaluatorService.getEvaluatorByUserOrSystemType(ctxFromHono(c), currentUser(c)), 200);
});

app.post("/llm_evaluator", async (c) => {
  const body = await requiredJsonBody(c, "com.planck.planck.domain.evaluator.llm.dto.LLMEvaluatorRequestDTO");
  const request = { ...body, output_format_type: bindEnum(body.output_format_type, ScoreTypeValues, SCORE_TYPE) } as LLMEvaluatorRequestDTO.LLMEvaluatorRequestDTO;
  LLMEvaluatorRequestDTO.validate(request);
  return c.json(await NewLLMEvaluatorService.createLLMEvaluator(ctxFromHono(c), request, currentUser(c)), 200);
});

/** Used evaluators are deprecated, unused ones deleted. */
app.delete("/llm_evaluator/:evaluatorId", async (c) => {
  const evaluatorId = c.req.param("evaluatorId");
  await NewLLMEvaluatorService.removeLLMEvaluatorById(ctxFromHono(c), currentUser(c), evaluatorId);
  return c.json({ message: `${evaluatorId} removed successfully` }, 200);
});

app.patch("/llm_evaluator/:evaluatorId", async (c) => {
  const body = await requiredJsonBody(c, "com.planck.planck.domain.evaluator.llm.dto.LLMEvaluatorUpdateDTO");
  const request = { ...body, output_format_type: bindEnum(body.output_format_type, ScoreTypeValues, SCORE_TYPE) } as LLMEvaluatorUpdateDTO.LLMEvaluatorUpdateDTO;
  LLMEvaluatorUpdateDTO.validate(request);
  return c.json(
    await NewLLMEvaluatorService.updateLLMEvaluator(ctxFromHono(c), request, c.req.param("evaluatorId"), currentUser(c)),
    200,
  );
});

export default app;
