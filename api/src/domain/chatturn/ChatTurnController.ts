/** Port of domain/chatturn/ChatTurnController (`/chat-turn`). */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { RuntimeException } from "../../lib/errors";
import { jsonBody } from "../../lib/http";
import { beforeBodyWrite } from "../tags/TagResponseEnrichmentAdvice";
import * as ChatTurnService from "./service/ChatTurnService";
import { fromChatTurn } from "./dto/ChatTurnDTO";
import type { UpdateChatTurnRequestDTO } from "./dto/UpdateChatTurnRequestDTO";

const app = new Hono<AppEnv>();

app.get("/chat-turn/:chatTurnId", async (c) => {
  const ctx = ctxFromHono(c);
  const turn = await ChatTurnService.getChatTurn(ctx, c.req.param("chatTurnId"), requireUser(ctx));
  if (!turn) {
    // `new ChatTurnDTO(null)` → NullPointerException → RuntimeException handler.
    throw new RuntimeException(
      'Cannot invoke "com.planck.planck.entitities.ChatTurn.getInputs()" because "chatTurn" is null',
    );
  }
  return c.json(await beforeBodyWrite(ctx, await fromChatTurn(ctx.db, turn)));
});

app.put("/chat-turn/:chatTurnId", async (c) => {
  const ctx = ctxFromHono(c);
  const request = await jsonBody<UpdateChatTurnRequestDTO>(c);
  await ChatTurnService.updateExpectedOutput(ctx, c.req.param("chatTurnId"), requireUser(ctx), request.expected_output ?? null);
  return c.body(null, 200);
});

export default app;
