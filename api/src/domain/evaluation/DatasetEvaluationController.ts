/** Port of domain/evaluation/DatasetEvaluationController (`/evaluations/dataset/{dataset_id}`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import { requiredJsonBody } from "../model/dto/jsonBinding";
import type { EvaluationBulkRequest } from "./dto/EvaluationBulkRequest";
import * as EvaluationService from "./serivce/EvaluationService";

const app = new Hono<AppEnv>();

/** Always ends in 501 NOT_IMPLEMENTED (or 400 when the data set has no chat turns), as in Java. */
app.post("/evaluations/dataset/:dataset_id", async (c) => {
  const request = (await requiredJsonBody(c, "com.planck.planck.domain.evaluation.dto.EvaluationBulkRequest")) as EvaluationBulkRequest;
  const response = await EvaluationService.generateScoresFromDataSet(
    ctxFromHono(c),
    c.req.param("dataset_id"),
    request.evaluator_ids,
    currentUser(c),
  );
  return c.json(response, 200);
});

export default app;
