/** Port of domain/evaluator/heuristic/PointwiseHeuristicEvaluatorController (`/pointwise-heuristic`). */
import { Hono } from "hono";
import type { AppEnv } from "../../../env";
import { CriteriaTypeValues } from "../../../enums/CriteriaType";
import { currentUser } from "../../../lib/auth";
import { ctxFromHono } from "../../../lib/ctx";
import { bindEnum, bindString, requiredJsonBody } from "../../model/dto/jsonBinding";
import type { PointwiseHeuristicEvaluatorUpdateDTO } from "../dto/PointwiseHeuristicEvaluatorUpdateDTO";
import * as PointwiseHeuristicEvaluatorRequestDTO from "./dto/PointwiseHeuristicEvaluatorRequestDTO";
import * as PointwiseHeuristicEvaluatorService from "./service/PointwiseHeuristicEvaluatorService";

const app = new Hono<AppEnv>();

app.post("/pointwise-heuristic", async (c) => {
  const body = await requiredJsonBody(c, "com.planck.planck.domain.evaluator.heuristic.dto.PointwiseHeuristicEvaluatorRequestDTO");
  const request: PointwiseHeuristicEvaluatorRequestDTO.PointwiseHeuristicEvaluatorRequestDTO = {
    name: bindString(body.name),
    criteria: bindString(body.criteria),
  };
  if ("criteria_type" in body) {
    request.criteria_type = bindEnum(body.criteria_type, CriteriaTypeValues, "com.planck.planck.enums.CriteriaType");
  }
  PointwiseHeuristicEvaluatorRequestDTO.validate(request);
  return c.json(await PointwiseHeuristicEvaluatorService.createEvaluator(ctxFromHono(c), request, currentUser(c)), 200);
});

app.get("/pointwise-heuristic", async (c) => {
  return c.json(await PointwiseHeuristicEvaluatorService.getEvaluatorsByUser(ctxFromHono(c), currentUser(c)), 200);
});

app.get("/pointwise-heuristic/:evaluatorId", async (c) => {
  return c.json(
    await PointwiseHeuristicEvaluatorService.getEvaluatorById(ctxFromHono(c), c.req.param("evaluatorId"), currentUser(c)),
    200,
  );
});

app.put("/pointwise-heuristic/:evaluatorId", async (c) => {
  const body = await requiredJsonBody(c, "com.planck.planck.domain.evaluator.dto.PointwiseHeuristicEvaluatorUpdateDTO");
  const request: PointwiseHeuristicEvaluatorUpdateDTO = { name: bindString(body.name) };
  return c.json(
    await PointwiseHeuristicEvaluatorService.updateEvaluator(ctxFromHono(c), c.req.param("evaluatorId"), request, currentUser(c)),
    200,
  );
});

/** Used evaluators are deprecated, unused ones deleted. */
app.delete("/pointwise-heuristic/:evaluatorId", async (c) => {
  const evaluatorId = c.req.param("evaluatorId");
  await PointwiseHeuristicEvaluatorService.removePointwiseHeuristicEvaluatorById(ctxFromHono(c), evaluatorId, currentUser(c));
  return c.json({ message: `${evaluatorId} removed successfully` }, 200);
});

export default app;
