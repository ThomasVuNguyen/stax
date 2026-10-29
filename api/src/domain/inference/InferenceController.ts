/**
 * Port of domain/inference/InferenceController (@RequestMapping "/inference/projects/{projectId}").
 *
 * No @PreAuthorize and no @Valid in the Java controller: ownership is enforced by the services
 * (getProjectForUser → 404) and request bodies are not bean-validated.
 *
 * POST /chat/stream answers `text/event-stream` with one `data:<StreamingChatResponse JSON>\n\n`
 * event per chunk, exactly as Spring MVC wrote a Flux<StreamingChatResponse>. Errors raised before
 * the stream starts are normal JSON error responses; errors during the stream end it (Spring had
 * already committed the 200 response and could not send an error body either).
 */
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppEnv } from "../../env";
import { type Ctx, ctxFromHono, requireUser } from "../../lib/ctx";
import { jsonBody, rateLimit } from "../../lib/http";
import type { User } from "../../entities/User";
import * as StreamingChatResponse from "../../llmproviders/dto/StreamingChatResponse";
import * as InferenceStatusService from "../inferencestatus/InferenceStatusService";
import * as TagResponseEnrichmentAdvice from "../tags/TagResponseEnrichmentAdvice";
import type { BulkInferenceForProjectRequest } from "./dto/BulkInferenceForProjectRequest";
import type { BulkInferenceRequest } from "./dto/BulkInferenceRequest";
import type { QuickCompareInferenceRequest } from "./dto/QuickCompareInferenceRequest";
import * as InferenceService from "./service/InferenceService";
import * as PlaygroundInferenceService from "./service/PlaygroundInferenceService";
import * as StreamingInferenceService from "./service/StreamingInferenceService";

const BASE = "/inference/projects/:projectId";

const app = new Hono<AppEnv>();

/** @AuthenticationPrincipal User user (the authenticated user row). */
function principal(ctx: Ctx): User {
  return requireUser(ctx) as unknown as User;
}

app.post(`${BASE}/chat`, async (c) => {
  const ctx = ctxFromHono(c);
  const user = principal(ctx);
  const request = await jsonBody<QuickCompareInferenceRequest>(c);
  rateLimit(c, "quickCompareChatCompletion");
  const dto = await PlaygroundInferenceService.runInferenceWithConversation(
    ctx,
    user,
    c.req.param("projectId"),
    request.model_id as string,
    request.previous_chat_turn_id ?? null,
    request.prompts ?? null,
    request.variables ?? null,
  );
  // TagResponseEnrichmentAdvice: ChatTurnDTO is Taggable.
  return c.json(await TagResponseEnrichmentAdvice.beforeBodyWrite(ctx, dto), 200);
});

app.post(`${BASE}/bulk`, async (c) => {
  const ctx = ctxFromHono(c);
  const user = principal(ctx);
  const request = await jsonBody<BulkInferenceRequest>(c);
  rateLimit(c, "bulkChatCompletion");
  return c.json(
    await InferenceService.runReinference(ctx, user, c.req.param("projectId"), request.chat_turn_ids, request.model_ids),
    200,
  );
});

app.post(`${BASE}/bulk/all`, async (c) => {
  const ctx = ctxFromHono(c);
  const user = principal(ctx);
  const request = await jsonBody<BulkInferenceForProjectRequest>(c);
  rateLimit(c, "bulkChatCompletionAll");
  return c.json(await InferenceService.runReinferenceForProject(ctx, user, c.req.param("projectId"), request.model_ids), 200);
});

app.post(`${BASE}/:chatTurnId/stop`, async (c) => {
  const ctx = ctxFromHono(c);
  const user = principal(ctx);
  await InferenceStatusService.stopInferenceStatusByChatTurnIdAndProjectId(
    ctx,
    c.req.param("chatTurnId"),
    c.req.param("projectId"),
    user,
  );
  return c.body(null, 200);
});

app.post(`${BASE}/chat/stream`, async (c) => {
  const ctx = ctxFromHono(c);
  const user = principal(ctx);
  const request = await jsonBody<QuickCompareInferenceRequest>(c);
  rateLimit(c, "streamChatCompletion");
  const chunks = await StreamingInferenceService.streamChatCompletion(
    ctx,
    user,
    c.req.param("projectId"),
    request.model_id as string,
    request.previous_chat_turn_id ?? null,
    request.prompts ?? null,
  );
  return streamSSE(c, async (stream) => {
    try {
      for await (const chunk of chunks) {
        // Client went away: Spring cancelled the Flux (no finalisation, no FAILED status).
        if (stream.aborted || stream.closed) {
          await chunks.return(undefined);
          return;
        }
        await stream.write(`data:${JSON.stringify(StreamingChatResponse.toJson(chunk))}\n\n`);
      }
    } catch (e) {
      // Status already set to FAILED by the service; the stream just ends.
      console.error("Streaming chat completion failed", e);
    }
  });
});

export default app;
