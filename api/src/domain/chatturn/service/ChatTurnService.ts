/** Port of domain/chatturn/service/ChatTurnService + ChatTurnServiceImpl. */
import type { Ctx } from "../../../lib/ctx";
import { IllegalArgumentException } from "../../../lib/errors";
import type { Chat } from "../../../entities/Chat";
import type { ChatTurn } from "../../../entities/ChatTurn";
import * as ChatTurnRepository from "../ChatTurnRepository";
import * as ModelInputService from "../../modelinput/service/ModelInputService";

type UserRef = { id: string | null };

/** null when the turn does not exist or belongs to another user. */
export async function getChatTurn(ctx: Ctx, id: string, user: UserRef): Promise<ChatTurn | null> {
  return ChatTurnRepository.findByIdAndUser(ctx.db, id, user.id as string);
}

/** Sets the expected output on the turn's last input. */
export async function updateExpectedOutput(
  ctx: Ctx,
  chatTurnId: string,
  user: UserRef,
  expectedOutput: string | null,
): Promise<void> {
  const chatTurn = await getChatTurn(ctx, chatTurnId, user);
  if (!chatTurn) throw new IllegalArgumentException("Chat turn not found");
  const inputs = await ChatTurnRepository.findInputsByTurnId(ctx.db, chatTurn.id as string);
  if (!inputs.length) throw new IllegalArgumentException("No inputs found");
  const input = inputs[inputs.length - 1];
  input.expectedOutput = expectedOutput;
  await ModelInputService.save(ctx, input);
}

export async function findByChatIn(ctx: Ctx, chats: Chat[]): Promise<ChatTurn[]> {
  return ChatTurnRepository.findByChatIn(ctx.db, chats.map((c) => c.id as string));
}
