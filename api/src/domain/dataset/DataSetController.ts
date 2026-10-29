/**
 * Port of domain/dataset/DataSetController (`/datasets`).
 * Literal sub-paths (`rows/bulk`, `rows/bulk-by-chat-id`) are registered before `rows/:rowId`
 * because Hono matches in registration order (Spring preferred the literal match).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ChatTurnContainerType } from "../../enums/ChatTurnContainerType";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { IllegalArgumentException, IllegalInputException } from "../../lib/errors";
import { jsonBody, queryInt } from "../../lib/http";
import * as ChatService from "../chat/service/ChatService";
import * as ChatTurnDTO from "../chatturn/dto/ChatTurnDTO";
import * as ChatExportService from "../importexport/ChatExportService";
import * as ChatImportService from "../importexport/ChatImportService";
import * as ImportResultDTO from "../importexport/dto/ImportResultDTO";
import * as EvaluationContainerService from "../project/EvaluationContainerService";
import { jsonWithTags } from "../tags/TagResponseEnrichmentAdvice";
import * as WorkbookService from "../workbook/WorkbookService";
import * as ChatTurnWorkbookRowDTO from "../workbook/dto/ChatTurnWorkbookRowDTO";
import type { ChatTurnGroupCreateRequest } from "./dto/ChatTurnGroupCreateRequest";
import * as DataSetDTO from "./dto/DataSetDTO";
import type { DataSetRowDeleteByChatIdRequest } from "./dto/DataSetRowDeleteByChatIdRequest";
import type { DataSetRowDeleteRequest } from "./dto/DataSetRowDeleteRequest";
import type { DataSetRowUpdateRequest } from "./dto/DataSetRowUpdateRequest";
import type { DataSetUpdateRequest } from "./dto/DataSetUpdateRequest";
import type { RowCreateRequest } from "./dto/RowCreateRequest";
import * as DataSetService from "./service/DataSetService";

const app = new Hono<AppEnv>();

/** Spring's String → Boolean conversion for @RequestParam Boolean. */
function booleanParam(value: string | undefined, name: string, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const v = value.trim().toLowerCase();
  if (["true", "on", "yes", "1"].includes(v)) return true;
  if (["false", "off", "no", "0"].includes(v)) return false;
  throw new IllegalInputException(`Invalid value for parameter '${name}'`);
}

app.get("/datasets", async (c) => {
  const ctx = ctxFromHono(c);
  const includeHidden = booleanParam(c.req.query("include_hidden"), "include_hidden", false);
  return c.json(await DataSetService.getAllDataSets(ctx, requireUser(ctx), includeHidden), 200);
});

app.get("/datasets/:id", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await DataSetService.getDataSetById(ctx, requireUser(ctx), c.req.param("id")), 200);
});

app.post("/datasets", async (c) => {
  const ctx = ctxFromHono(c);
  const body = await jsonBody<DataSetDTO.DataSetDTO>(c);
  DataSetDTO.validateType(body.type);
  const created = await DataSetService.createDataSet(
    ctx,
    requireUser(ctx),
    body.name,
    body.description,
    DataSetDTO.typeOf(body),
  );
  return c.json(DataSetDTO.from(created), 201);
});

app.delete("/datasets/:id", async (c) => {
  const ctx = ctxFromHono(c);
  requireUser(ctx);
  await EvaluationContainerService.deleteContainer(ctx, c.req.param("id"));
  return c.body(null, 204);
});

app.patch("/datasets/:id", async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<DataSetUpdateRequest>(c);
  return c.json(
    await DataSetService.updateDataset(ctx, requireUser(ctx), c.req.param("id"), request.name, request.description),
    200,
  );
});

app.get("/datasets/:id/:chatId/rows", async (c) => {
  const ctx = ctxFromHono(c);
  const turns = await ChatService.getChat(ctx, c.req.param("chatId"), requireUser(ctx), null);
  // fromList also sets the rows' tags (TagResponseEnrichmentAdvice).
  return c.json(await ChatTurnWorkbookRowDTO.fromList(ctx, turns), 200);
});

app.get("/datasets/:id/rows", async (c) => {
  const ctx = ctxFromHono(c);
  requireUser(ctx);
  const dto = await WorkbookService.getData(
    ctx,
    c.req.param("id"),
    queryInt(c, "page_size", 20)!,
    queryInt(c, "page_token", 0)!,
    c.req.query("order_by") ?? "created_at desc",
    c.req.query("filter") ?? null,
    null,
  );
  return jsonWithTags(c, dto, 200);
});

app.post("/datasets/:id/row", async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<RowCreateRequest>(c);
  const chatTurn = await ChatService.createChatTurn(
    ctx,
    requireUser(ctx),
    c.req.param("id"),
    request.chat_id ?? null,
    request.model_prompt ?? null,
    request.model_response ?? null,
    request.model_id ?? null,
  );
  return jsonWithTags(c, await ChatTurnDTO.fromChatTurn(ctx.db, chatTurn), 200);
});

app.post("/datasets/:id/rows", async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<ChatTurnGroupCreateRequest[]>(c);
  const result = await ChatService.addTurnsInBulk(ctx, requireUser(ctx), c.req.param("id"), request);
  return jsonWithTags(c, result, 200);
});

app.delete("/datasets/:id/rows", async (c) => {
  const ctx = ctxFromHono(c);
  await ChatService.deleteChats(ctx, requireUser(ctx), c.req.param("id"));
  return c.body(null, 204);
});

app.delete("/datasets/:id/rows/bulk", async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const request = await jsonBody<DataSetRowDeleteRequest>(c);
  // Throws NotFoundException("Container not found for id: …") when it is not the user's.
  await EvaluationContainerService.getContainerForUser(ctx, c.req.param("id"));
  await ChatService.deleteByIds(ctx, user, request.chat_turn_ids ?? null);
  return c.body(null, 204);
});

app.delete("/datasets/:id/rows/bulk-by-chat-id", async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<DataSetRowDeleteByChatIdRequest>(c);
  await ChatService.deleteChatsByIds(ctx, request.chat_ids ?? null, requireUser(ctx), c.req.param("id"));
  return c.body(null, 204);
});

app.patch("/datasets/:id/rows/:rowId", async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<DataSetRowUpdateRequest>(c);
  const updated = await ChatService.updateTurn(
    ctx,
    requireUser(ctx),
    c.req.param("id"),
    c.req.param("rowId"),
    request.model_prompt ?? null,
    request.model_response ?? null,
    request.model_id ?? null,
    request.expected_output ?? null,
  );
  return jsonWithTags(c, await ChatTurnDTO.fromChatTurn(ctx.db, updated), 200);
});

app.delete("/datasets/:id/rows/:rowId", async (c) => {
  const ctx = ctxFromHono(c);
  await ChatService.delete(ctx, requireUser(ctx), c.req.param("rowId"));
  return c.body(null, 204);
});

app.get("/datasets/:id/export", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ChatExportService.exportAllChats(ctx, c.req.param("id"), requireUser(ctx)), 200);
});

/**
 * Multipart import. Column names are @RequestParams, so they may come from the query string or from
 * form fields (query first, like ServletRequest.getParameter).
 */
app.post("/datasets/:id/import", async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const form = await c.req.parseBody();
  const param = (name: string): string | null => {
    const q = c.req.query(name);
    if (q !== undefined) return q;
    const v = form[name];
    return typeof v === "string" ? v : null;
  };

  const file = form["file"];
  // MissingServletRequestPartException fell through to the generic 500 handler.
  if (!(file instanceof File)) throw new Error("Required part 'file' is not present.");
  if (file.size === 0) return c.json(ImportResultDTO.create(), 400);

  const variablesColumnNamesCsv = param("variables_column_names");
  let variablesColumnNames: string[] = [];
  if (variablesColumnNamesCsv !== null && variablesColumnNamesCsv.trim()) {
    variablesColumnNames = javaSplit(variablesColumnNamesCsv, /\s*,\s*/);
  }
  if (variablesColumnNames.length > 10) {
    throw new IllegalArgumentException("The number of variables columns cannot exceed 10.");
  }

  try {
    const result = await ChatImportService.importChatsFromFile(ctx, {
      file,
      user,
      sourceType: ChatTurnContainerType.DATASET,
      sourceId: c.req.param("id"),
      chatColumnName: param("chat_column_name"),
      metadataColumnNames: variablesColumnNames,
      inputColumnName: param("input_column_name"),
      outputColumnName: param("output_column_name"),
      expectedOutputColumnName: param("expected_output_name"),
      tagsColumnName: param("tags_column_name"),
      systemInstructionColumnName: param("system_instruction_column_name"),
      modelLabelColumnName: param("model_label_column_name"),
      humanEvalScoreColumnName: param("human_eval_score_column_name"),
      humanEvalNotesColumnName: param("human_eval_score_notes_column_name"),
      inferenceAnalyticsColumnName: param("inference_analytics_column_name"),
      llmEvaluationsColumnName: param("llm_evaluations_column_name"),
    });
    return c.json(result, 200);
  } catch (e) {
    console.error("Chat import failed", e);
    return c.json(ImportResultDTO.create(), 400);
  }
});

/** String.split(regex): trailing empty strings are removed. */
function javaSplit(s: string, re: RegExp): string[] {
  const parts = s.split(re);
  if (parts.length === 1) return parts; // no separator found
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

export default app;
