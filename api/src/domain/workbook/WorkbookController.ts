/** Port of domain/workbook/WorkbookController (`/workbook/projects/{projectId}`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { jsonBody, queryInt, queryList, rateLimit } from "../../lib/http";
import * as ChatService from "../chat/service/ChatService";
import * as ChatTurnUpdateRequest from "./dto/ChatTurnUpdateRequest";
import * as ChatTurnWorkbookRowDTO from "./dto/ChatTurnWorkbookRowDTO";
import * as WorkBookClearResultsRequest from "./dto/WorkBookClearResultsRequest";
import * as WorkBookDeleteRowsRequest from "./dto/WorkBookDeleteRowsRequest";
import type { WorkBookRowCreateRequest } from "./dto/WorkBookRowCreateRequest";
import * as WorkbookService from "./WorkbookService";

const app = new Hono<AppEnv>();
const BASE = "/workbook/projects/:projectId";

// @RateLimited runs as an aspect around the handler, i.e. after argument binding / validation.
app.get(BASE, async (c) => {
  const ctx = ctxFromHono(c);
  const pageSize = queryInt(c, "page_size", 20) as number;
  const pageToken = queryInt(c, "page_token", 0) as number;
  rateLimit(c, "getWorkbook");
  const response = await WorkbookService.getData(
    ctx,
    requireUser(ctx),
    c.req.param("projectId"),
    pageSize,
    pageToken,
    c.req.query("order_by") ?? "created_at desc",
    c.req.query("filter") ?? null,
    queryList(c, "tagIds") ?? null,
  );
  return c.json(response, 200);
});

app.post(`${BASE}/row`, async (c) => {
  const ctx = ctxFromHono(c);
  const input = await jsonBody<WorkBookRowCreateRequest>(c);
  const prompt = input?.prompt ?? null;
  const modelId = prompt != null ? (input.model_id ?? null) : null;
  const chatTurn = await ChatService.createChatTurn(ctx, requireUser(ctx), c.req.param("projectId"), null, prompt, null, modelId);
  return c.json(await ChatTurnWorkbookRowDTO.from(ctx, chatTurn), 200);
});

app.patch(`${BASE}/rows/:chatTurnId`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<ChatTurnUpdateRequest.ChatTurnUpdateRequest>(c);
  ChatTurnUpdateRequest.validate(request);
  const updatedChatTurn = await ChatService.updateTurn(
    ctx,
    requireUser(ctx),
    c.req.param("projectId"),
    c.req.param("chatTurnId"),
    request.prompt ?? null,
    request.model_response ?? null,
    request.model_id ?? null,
    request.expected_output ?? null,
  );
  return c.json(await ChatTurnWorkbookRowDTO.from(ctx, updatedChatTurn), 200);
});

// Literal paths before their shorter siblings so "/all" is never taken for something else.
app.delete(`${BASE}/delete-rows/all`, async (c) => {
  rateLimit(c, "deleteAllChats");
  const ctx = ctxFromHono(c);
  return c.json(await WorkbookService.deleteChatsByProject(ctx, requireUser(ctx), c.req.param("projectId")), 200);
});

app.delete(`${BASE}/delete-rows`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<WorkBookDeleteRowsRequest.WorkBookDeleteRowsRequest>(c);
  WorkBookDeleteRowsRequest.validate(request);
  rateLimit(c, "deleteChats");
  return c.json(await WorkbookService.getDeleteChats(ctx, requireUser(ctx), c.req.param("projectId"), request.chat_ids as string[]), 200);
});

app.delete(`${BASE}/clear-results/all`, async (c) => {
  rateLimit(c, "clearResultsForProject");
  const ctx = ctxFromHono(c);
  await ChatService.deleteTurnResultsByProject(ctx, requireUser(ctx), c.req.param("projectId"));
  return c.body(null, 200);
});

app.delete(`${BASE}/clear-results`, async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<WorkBookClearResultsRequest.WorkBookClearResultsRequest>(c);
  WorkBookClearResultsRequest.validate(request);
  rateLimit(c, "clearResults");
  await ChatService.deleteTurnResultsByTurnIds(ctx, requireUser(ctx), c.req.param("projectId"), request.chat_turn_ids as string[]);
  return c.body(null, 200);
});

export default app;
