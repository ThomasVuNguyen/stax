/** Port of domain/project/SXSController (`/sxs/containers/{containerId}`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import type { User } from "../../entities/User";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { InvalidDataException } from "../../lib/errors";
import { jsonBody, queryInt, queryList, rateLimit } from "../../lib/http";
import { SXSGenerateOutputsMode } from "../../enums/SXSGenerateOutputsMode";
import * as SXSMetricsService from "../analytics/SXSMetricsService";
import * as SXSHumanFeedbackService from "../evaluation/SXSHumanFeedbackService";
import type { SxsImportRequest } from "../importexport/dto/SxsImportRequest";
import * as SxsEvaluationPairImportService from "../importexport/SxsEvaluationPairImportService";
import * as SxsExportService from "../importexport/SxsExportService";
import type { ContinueSxsRequestDTO } from "../inference/dto/ContinueSxsRequestDTO";
import type { GenerateTurnBRequestDTO } from "../inference/dto/GenerateTurnBRequestDTO";
import type { SXSGenerateOutputs } from "../inference/dto/SXSGenerateOutputs";
import type { SXSGenerateOutputsBase } from "../inference/dto/SXSGenerateOutputsBase";
import * as SXSGenerateOutputsService from "../inference/outputs/SXSGenerateOutputsService";
import * as SxsPlaygroundInferenceService from "../inference/service/SxsPlaygroundInferenceService";
import * as SXSChatRowDTO from "./dto/SXSChatRowDTO";
import type { SxsCreateRequest } from "./dto/SxsCreateRequest";
import * as SxsEvaluationPairDTO from "./dto/SxsEvaluationPairDTO";
import type { SxsEvaluationPairUpdateDTO } from "./dto/SxsEvaluationPairUpdateDTO";
import type { SXSHumanFeedbackRequestDTO } from "./dto/SXSHumanFeedbackRequestDTO";
import * as SxsInferenceRequestDTO from "./dto/SxsInferenceRequestDTO";
import type { SxsPairsDeleteRequest } from "./dto/SxsPairsDeleteRequest";
import * as SxsEvaluationPairService from "./SxsEvaluationPairService";

const app = new Hono<AppEnv>();
const BASE = "/sxs/containers/:containerId";

/** `new ImportResultDTO()` as Jackson serialised it. */
const EMPTY_IMPORT_RESULT = { totalRows: 0, successfulRows: 0, failedRows: 0, errorMessages: [] as string[] };

/** SxsPlaygroundInferenceService types its user as the User entity; it only reads `id`. */
const asUser = (u: { id: string }) => u as unknown as User;

/** Jackson field initializer `mode = MISSING_ONLY` when the property is absent. */
function withDefaultMode<T extends { mode?: unknown }>(body: T): T {
  if (body.mode === undefined) body.mode = SXSGenerateOutputsMode.MISSING_ONLY;
  return body;
}

// ---- workbook / rows ------------------------------------------------------------------------

app.get(`${BASE}/workbook`, async (c) => {
  const ctx = ctxFromHono(c);
  const pageSize = queryInt(c, "page_size", 20) as number;
  const pageToken = queryInt(c, "page_token", 0) as number;
  rateLimit(c, "getSXS");
  const user = requireUser(ctx);
  const response = await SxsEvaluationPairService.getSXSRows(
    ctx,
    user,
    c.req.param("containerId"),
    pageSize,
    pageToken,
    c.req.query("order_by") ?? "created_at desc",
    c.req.query("filter") ?? null,
    queryList(c, "tagIds") ?? null,
  );
  await SXSHumanFeedbackService.setHumanFeedbackForSxsRows(ctx, response.sxs_rows, user);
  return c.json(response, 200);
});

app.get(`${BASE}/workbook/:pairId`, async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const response = await SxsEvaluationPairService.getSXSRowsForPair(
    ctx,
    user,
    c.req.param("containerId"),
    c.req.param("pairId"),
  );
  await SXSHumanFeedbackService.setHumanFeedbackForSxsRows(ctx, response, user);
  return c.json(response, 200);
});

// ---- metrics / analytics --------------------------------------------------------------------

app.get(`${BASE}/human-eval-metrics`, async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await SXSMetricsService.getHumanEvalMetrics(ctx, c.req.param("containerId"), requireUser(ctx)), 200);
});

app.get(`${BASE}/sxs-eval-metrics`, async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await SXSMetricsService.getSxsEvalMetrics(ctx, c.req.param("containerId"), requireUser(ctx)), 200);
});

app.get(`${BASE}/inference-metrics`, async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await SXSMetricsService.getInferenceMetrics(ctx, c.req.param("containerId"), requireUser(ctx)), 200);
});

app.get(`${BASE}/evaluation-analytics/:scorerId`, async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(
    await SXSMetricsService.getEvaluationAnalyticsByScorer(
      ctx,
      c.req.param("containerId"),
      c.req.param("scorerId"),
      requireUser(ctx),
    ),
    200,
  );
});

app.get(`${BASE}/evaluation-analytics`, async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await SXSMetricsService.getEvaluationAnalyticsForAllScorers(ctx, c.req.param("containerId"), requireUser(ctx)), 200);
});

// ---- export / import ------------------------------------------------------------------------

app.get(`${BASE}/export`, async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await SxsExportService.exportSxsPairsForProject(ctx, c.req.param("containerId"), requireUser(ctx)), 200);
});

app.post(`${BASE}/export`, async (c) => {
  const ctx = ctxFromHono(c);
  const pairIds = await jsonBody<string[]>(c);
  return c.json(
    await SxsExportService.exportSxsPairsByIds(
      ctx,
      c.req.param("containerId"),
      Array.isArray(pairIds) ? pairIds : null,
      requireUser(ctx),
    ),
    200,
  );
});

app.post(`${BASE}/import`, async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const file = (form as Record<string, unknown>)["file"];
  if (!(file instanceof File)) {
    // MissingServletRequestPartException → catch-all handler (500).
    throw new Error("Required part 'file' is not present.");
  }
  const param = (name: string): string | null => {
    const q = c.req.query(name);
    if (q !== undefined) return q;
    const f = (form as Record<string, unknown>)[name];
    return typeof f === "string" ? f : null;
  };
  if (file.size === 0) return c.json(EMPTY_IMPORT_RESULT, 400);
  try {
    const importRequest = {
      file,
      user,
      projectId: c.req.param("containerId"),
      chatAColumnName: param("chat_a_column_name"),
      chatBColumnName: param("chat_b_column_name"),
      inputColumnName: param("input_column_name"),
      systemInstructionAColumnName: param("system_instruction_a_column_name"),
      systemInstructionBColumnName: param("system_instruction_b_column_name"),
      outputAColumnName: param("output_a_column_name"),
      outputBColumnName: param("output_b_column_name"),
      modelLabelAColumnName: param("model_label_a_column_name"),
      modelLabelBColumnName: param("model_label_b_column_name"),
      tagsColumnName: param("tags_column_name"),
      llmEvaluationsAColumnName: param("llm_evaluations_a_column_name"),
      llmEvaluationsBColumnName: param("llm_evaluations_b_column_name"),
      inferenceAnalyticsAColumnName: param("inference_analytics_a_column_name"),
      inferenceAnalyticsBColumnName: param("inference_analytics_b_column_name"),
      variablesColumnName: param("variables_column_name"),
      ratingColumnName: param("human_sxs_rating_column_name"),
      notesColumnName: param("human_sxs_notes_column_name"),
      expectedOutputColumnName: param("expected_output_column_name"),
    } as SxsImportRequest;
    return c.json(await SxsEvaluationPairImportService.importSxsPairs(ctx, importRequest), 200);
  } catch (e) {
    console.error("SxS import failed", e);
    return c.json(EMPTY_IMPORT_RESULT, 400);
  }
});

// ---- inference / generation -----------------------------------------------------------------

app.post(`${BASE}/inference`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<SxsInferenceRequestDTO.SxsInferenceRequestDTO>(c);
  SxsInferenceRequestDTO.validate(request);
  const pair = await SxsPlaygroundInferenceService.runInitialSxsInference(
    ctx,
    asUser(requireUser(ctx)),
    c.req.param("containerId"),
    request,
  );
  return c.json(await SXSChatRowDTO.from(ctx, pair, null), 201);
});

app.post(`${BASE}/generate-outputs/all`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = withDefaultMode(await jsonBody<SXSGenerateOutputsBase>(c));
  return c.json(await SXSGenerateOutputsService.generateAllOutputs(ctx, c.req.param("containerId"), request, requireUser(ctx)), 200);
});

app.post(`${BASE}/generate-outputs`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = withDefaultMode(await jsonBody<SXSGenerateOutputs>(c));
  const ids = (request as { sxsPairIds?: unknown }).sxsPairIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new InvalidDataException("sxsPairIds: SXS pair IDs are required");
  }
  return c.json(await SXSGenerateOutputsService.generateOutputs(ctx, c.req.param("containerId"), request, requireUser(ctx)), 200);
});

// ---- pair CRUD ------------------------------------------------------------------------------

app.post(BASE, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<SxsCreateRequest>(c);
  const prompt = request?.prompt ?? null;
  const expectedOutput = request?.expected_output ?? null;
  const pair = await SxsEvaluationPairService.createSxsPair(
    ctx,
    requireUser(ctx),
    c.req.param("containerId"),
    prompt,
    expectedOutput,
  );
  return c.json(SxsEvaluationPairDTO.from(pair), 200);
});

app.delete(`${BASE}/all`, async (c) => {
  const ctx = ctxFromHono(c);
  await SxsEvaluationPairService.deleteSxsPairsByContainer(ctx, c.req.param("containerId"), requireUser(ctx));
  return c.body(null, 204);
});

app.delete(BASE, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<SxsPairsDeleteRequest>(c);
  await SxsEvaluationPairService.deleteSxsPairsByIds(ctx, request.pair_ids ?? null, requireUser(ctx));
  return c.body(null, 204);
});

app.post(`${BASE}/:pairId/human-feedback`, async (c) => {
  const ctx = ctxFromHono(c);
  const containerId = c.req.param("containerId");
  const pairId = c.req.param("pairId");
  const request = await jsonBody<SXSHumanFeedbackRequestDTO>(c);
  const user = requireUser(ctx);
  const humanFeedback = await SXSHumanFeedbackService.submitHumanFeedback(ctx, user, containerId, pairId, request);
  const pair = await SxsEvaluationPairService.getSxsPairById(ctx, pairId, user);
  return c.json(await SXSChatRowDTO.from(ctx, pair, humanFeedback), 200);
});

app.delete(`${BASE}/:pairId/human-feedback/:chatTurnA/:chatTurnB`, async (c) => {
  const ctx = ctxFromHono(c);
  await SXSHumanFeedbackService.deleteHumanFeedbackForChatTurn(
    ctx,
    requireUser(ctx),
    c.req.param("containerId"),
    c.req.param("pairId"),
    c.req.param("chatTurnA"),
    c.req.param("chatTurnB"),
  );
  return c.body(null, 204);
});

app.delete(`${BASE}/:pairId/human-feedback`, async (c) => {
  const ctx = ctxFromHono(c);
  await SXSHumanFeedbackService.deleteHumanFeedback(ctx, requireUser(ctx), c.req.param("containerId"), c.req.param("pairId"));
  return c.body(null, 204);
});

app.post(`${BASE}/:pairId/generate-b`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<GenerateTurnBRequestDTO>(c);
  const modelId = (request as { model_id?: string | null }).model_id;
  if (modelId == null || modelId === "") throw new InvalidDataException("modelId: modelId is required");
  const updatedPair = await SxsEvaluationPairService.generateAndSetTurnB(
    ctx,
    requireUser(ctx),
    c.req.param("containerId"),
    c.req.param("pairId"),
    modelId,
    true,
  );
  return c.json(SxsEvaluationPairDTO.from(updatedPair), 200);
});

app.post(`${BASE}/:pairId/continue`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<ContinueSxsRequestDTO>(c);
  const updatedPair = await SxsPlaygroundInferenceService.continueSxsEvaluation(
    ctx,
    asUser(requireUser(ctx)),
    c.req.param("containerId"),
    c.req.param("pairId"),
    request,
  );
  return c.json(await SXSChatRowDTO.from(ctx, updatedPair, null), 200);
});

app.get(`${BASE}/:pairId/export`, async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await SxsExportService.exportSxsPair(ctx, c.req.param("pairId"), requireUser(ctx), c.req.param("containerId")), 200);
});

app.patch(`${BASE}/:pairId`, async (c) => {
  const ctx = ctxFromHono(c);
  const containerId = c.req.param("containerId");
  const pairId = c.req.param("pairId");
  const update = await jsonBody<SxsEvaluationPairUpdateDTO>(c);
  const user = requireUser(ctx);
  const pair = await SxsEvaluationPairService.updateSxsPair(
    ctx,
    pairId,
    containerId,
    user,
    update.input,
    update.expectedOutput,
    update.variables,
    update.tags,
  );
  const humanFeedback = await SXSHumanFeedbackService.getHumanFeedback(ctx, user, pairId);
  return c.json(await SXSChatRowDTO.from(ctx, pair, humanFeedback), 200);
});

app.delete(`${BASE}/:pairId`, async (c) => {
  const ctx = ctxFromHono(c);
  await SxsEvaluationPairService.deleteSxsPair(ctx, c.req.param("pairId"), requireUser(ctx));
  return c.body(null, 204);
});

export default app;
