/** Port of domain/evaluation/EvaluationController (`/evaluations/projects/{project_id}`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import { assertProjectAccess } from "../../lib/permissions";
import { requiredJsonBody } from "../model/dto/jsonBinding";
import * as ChatTurnEvaluationRequest from "./dto/ChatTurnEvaluationRequest";
import * as ChatTurnsEvaluationRequest from "./dto/ChatTurnsEvaluationRequest";
import type { EvaluationBulkRequest } from "./dto/EvaluationBulkRequest";
import * as EvaluationService from "./serivce/EvaluationService";

const app = new Hono<AppEnv>();
const BASE = "/evaluations/projects/:project_id";

/** Evaluates chat turns and/or SxS pairs: one queued job per (item, evaluator). */
app.post(`${BASE}/chat-turns`, async (c) => {
  const request = (await requiredJsonBody(c, "com.planck.planck.domain.evaluation.dto.ChatTurnsEvaluationRequest")) as ChatTurnsEvaluationRequest.ChatTurnsEvaluationRequest;
  ChatTurnsEvaluationRequest.validate(request);
  const ctx = ctxFromHono(c);
  const projectId = c.req.param("project_id");
  await assertProjectAccess(ctx, projectId, "write");
  const response = await EvaluationService.generateScoresFromChatTurns(
    ctx,
    request.chat_turn_ids,
    request.pair_evaluations,
    request.evaluator_ids,
    projectId,
    currentUser(c),
  );
  return c.json(response, 200);
});

/** Evaluates a single chat turn or SxS pair synchronously; returns a ChatTurnDTO or SXSChatRowDTO. */
app.post(`${BASE}/chat-turn`, async (c) => {
  const request = (await requiredJsonBody(c, "com.planck.planck.domain.evaluation.dto.ChatTurnEvaluationRequest")) as ChatTurnEvaluationRequest.ChatTurnEvaluationRequest;
  ChatTurnEvaluationRequest.validate(request);
  const result = await EvaluationService.generateScore(ctxFromHono(c), request, c.req.param("project_id"), currentUser(c));
  return c.json(result as object, 200);
});

/** Evaluates every latest chat turn (or every SxS pair) of the project. */
app.post(BASE, async (c) => {
  const request = (await requiredJsonBody(c, "com.planck.planck.domain.evaluation.dto.EvaluationBulkRequest")) as EvaluationBulkRequest;
  const response = await EvaluationService.generateScoresFromProject(
    ctxFromHono(c),
    c.req.param("project_id"),
    request.evaluator_ids,
    currentUser(c),
  );
  return c.json(response, 200);
});

/**
 * Java bound `@PathVariable("projectId")` while the mapping declares `{project_id}`, so Spring
 * failed with MissingPathVariableException before calling the service (500 through the generic
 * handler). Reproduced as is; EvaluationStatusService.stopEvaluation is ported for callers.
 */
app.post(`${BASE}/:id/stop`, async () => {
  throw new Error("Required URI template variable 'projectId' for method parameter type String is not present");
});

export default app;
