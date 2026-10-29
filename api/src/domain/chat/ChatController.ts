/** Port of domain/chat/ChatController (`/chat`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { RuntimeException } from "../../lib/errors";
import { jsonBody, queryList } from "../../lib/http";
import { beforeBodyWrite } from "../tags/TagResponseEnrichmentAdvice";
import * as ChatExportService from "../importexport/ChatExportService";
import * as ChatTurnWorkbookRowDTO from "../workbook/dto/ChatTurnWorkbookRowDTO";
import * as ChatService from "./service/ChatService";
import { fromChatTurns } from "./dto/ChatDTO";

const app = new Hono<AppEnv>();

/** `@RequestBody Map<String, String>`: Jackson coerces scalars to strings; anything else fails binding. */
async function stringMapBody(c: Parameters<typeof jsonBody>[0]): Promise<Record<string, string>> {
  const body = await jsonBody<unknown>(c);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new RuntimeException("JSON parse error: Cannot deserialize value of type `java.util.LinkedHashMap<java.lang.String,java.lang.String>`");
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (v !== null && typeof v === "object") {
      throw new RuntimeException("JSON parse error: Cannot deserialize value of type `java.lang.String` from Object value");
    }
    out[k] = v as string;
    if (v !== null && typeof v !== "string") out[k] = String(v);
  }
  return out;
}

/** `@RequestBody List<String>`. */
async function stringListBody(c: Parameters<typeof jsonBody>[0]): Promise<string[]> {
  const body = await jsonBody<unknown>(c);
  if (!Array.isArray(body)) {
    throw new RuntimeException("JSON parse error: Cannot deserialize value of type `java.util.ArrayList<java.lang.String>` from Object value");
  }
  return body as string[];
}

// Literal first segments before "/chat/:chatId…".
app.get("/chat/workbook/:chatId", async (c) => {
  const ctx = ctxFromHono(c);
  const turns = await ChatService.getChat(ctx, c.req.param("chatId"), requireUser(ctx), queryList(c, "tagIds") ?? null);
  // fromList also sets the rows' tags (TagResponseEnrichmentAdvice).
  return c.json(await ChatTurnWorkbookRowDTO.fromList(ctx, turns));
});

app.post("/chat/export", async (c) => {
  const ctx = ctxFromHono(c);
  const chatIds = await stringListBody(c);
  return c.json(await ChatExportService.exportChats(ctx, chatIds, requireUser(ctx)));
});

app.get("/chat/:chatId", async (c) => {
  const ctx = ctxFromHono(c);
  const turns = await ChatService.getChat(ctx, c.req.param("chatId"), requireUser(ctx), queryList(c, "tagIds") ?? null);
  return c.json(await beforeBodyWrite(ctx, await fromChatTurns(ctx.db, turns)));
});

app.get("/chat/:chatId/turns/:turnId", async (c) => {
  const ctx = ctxFromHono(c);
  const turns = await ChatService.getChatUntilTurn(ctx, c.req.param("chatId"), c.req.param("turnId"), requireUser(ctx));
  return c.json(await beforeBodyWrite(ctx, await fromChatTurns(ctx.db, turns)));
});

app.get("/chat/:chatId/export", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ChatExportService.exportChat(ctx, c.req.param("chatId"), requireUser(ctx)));
});

app.get("/chat/:chatId/variables/keys", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ChatService.getVariablesKeys(ctx, c.req.param("chatId"), requireUser(ctx)));
});

app.get("/chat/:chatId/variables", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ChatService.getVariables(ctx, c.req.param("chatId"), requireUser(ctx)));
});

app.put("/chat/:chatId/variables", async (c) => {
  const ctx = ctxFromHono(c);
  const newVariables = await stringMapBody(c);
  const chat = await ChatService.replaceVariables(ctx, c.req.param("chatId"), requireUser(ctx), newVariables);
  return c.json(chat.variables);
});

app.patch("/chat/:chatId/variables", async (c) => {
  const ctx = ctxFromHono(c);
  const updates = await stringMapBody(c);
  const chat = await ChatService.addOrUpdateVariables(ctx, c.req.param("chatId"), requireUser(ctx), updates);
  return c.json(chat.variables);
});

app.delete("/chat/:chatId/variables/:key", async (c) => {
  const ctx = ctxFromHono(c);
  const chat = await ChatService.removeVariablesKey(ctx, c.req.param("chatId"), requireUser(ctx), c.req.param("key"));
  return c.json(chat.variables);
});

export default app;
