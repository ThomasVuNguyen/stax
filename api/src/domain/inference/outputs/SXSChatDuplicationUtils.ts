/**
 * Port of domain/inference/outputs/SXSChatDuplicationUtils: detects model mismatches on SxS pairs
 * and creates new pairs over duplicated chats (ChatService.duplicateChatsForSideB, which leaves
 * the last turn of each copy without a response).
 */
import type { Ctx } from "../../../lib/ctx";
import { RuntimeException } from "../../../lib/errors";
import { javaRuntimeException } from "../service/JavaExceptions";
import * as SxsEvaluationPairEntity from "../../../entities/SxsEvaluationPair";
import type { SxsEvaluationPair } from "../../../entities/SxsEvaluationPair";
import type { Model } from "../../../entities/Model";
import type { User } from "../../../entities/User";
import * as ChatService from "../../chat/service/ChatService";
import * as SxsEvaluationPairRepository from "../../evaluation/SxsEvaluationPairRepository";
import {
  type LoadedChat,
  type LoadedChatTurn,
  getLatestTurn,
  loadChatTurnsOfAll,
  mapGet,
} from "../service/ChatTurnGraph";

/** SxsEvaluationPair with its chats (and their turns) loaded. */
export interface LoadedSxsPair extends SxsEvaluationPair {
  chatA: LoadedChat | null;
  chatB: LoadedChat | null;
}

/** `chat.getLatestTurn()` dereferenced the way Java did (null → NullPointerException). */
export function latestTurnOf(chat: LoadedChat | null): LoadedChatTurn {
  if (chat == null) throw javaRuntimeException(`Cannot invoke "com.planck.planck.entitities.Chat.getLatestTurn()" because the chat is null`);
  const t = getLatestTurn(chat);
  if (!t) throw new RuntimeException(`Cannot invoke "com.planck.planck.entitities.ChatTurn.getModelResponse()" because the return value of "com.planck.planck.entitities.Chat.getLatestTurn()" is null`);
  return t;
}

export function findPairsWithModelMismatch(
  sxsPairs: LoadedSxsPair[],
  modelA: Model | null,
  modelB: Model | null,
  failedPairIds: string[],
): LoadedSxsPair[] {
  return sxsPairs.filter((p) => !failedPairIds.includes(p.id as string) && hasModelMismatch(p, modelA, modelB));
}

export function hasModelMismatch(sxsPair: LoadedSxsPair, modelA: Model | null, modelB: Model | null): boolean {
  return hasSideModelMismatch(modelA, sxsPair.chatA) || hasSideModelMismatch(modelB, sxsPair.chatB);
}

export function hasSideModelMismatch(expectedModel: Model | null, chat: LoadedChat | null): boolean {
  if (expectedModel == null || chat == null) return false;
  const response = latestTurnOf(chat).modelResponse;
  return response != null && response.model != null && response.model.id !== expectedModel.id;
}

/**
 * `chatService.duplicateChatsForSideB(chats, user)` with the copies' turns loaded, keyed by the
 * original chat id.
 */
export async function duplicateChatsForSideB(ctx: Ctx, chats: LoadedChat[], user: User): Promise<Map<string, LoadedChat>> {
  const result = await ChatService.duplicateChatsForSideB(ctx, chats, user);
  const out = new Map<string, LoadedChat>();
  for (const chat of chats) {
    const copy = mapGet<LoadedChat>(result, chat.id as string);
    if (copy) out.set(chat.id as string, { ...copy, turns: undefined });
  }
  await loadChatTurnsOfAll(ctx.db, [...out.values()]);
  return out;
}

export async function createNewPairsForMismatches(
  ctx: Ctx,
  mismatchedPairs: LoadedSxsPair[],
  user: User,
): Promise<LoadedSxsPair[]> {
  if (!mismatchedPairs.length) return [];

  // List.of(pair.getChatA(), pair.getChatB()) rejects nulls.
  const allChatsToDuplicate = mismatchedPairs.flatMap((pair) => {
    if (pair.chatA == null || pair.chatB == null) throw javaRuntimeException(null);
    return [pair.chatA, pair.chatB];
  });
  const duplicatedChats = await duplicateChatsForSideB(ctx, allChatsToDuplicate, user);

  const newPairs: LoadedSxsPair[] = mismatchedPairs.map((originalPair) => {
    const newChatA = duplicatedChats.get(originalPair.chatA!.id as string) as LoadedChat;
    const newChatB = duplicatedChats.get(originalPair.chatB!.id as string) as LoadedChat;
    return Object.assign(
      SxsEvaluationPairEntity.create({
        containerId: originalPair.containerId,
        userId: originalPair.userId,
        chatAId: newChatA.id,
        chatTurnAId: getLatestTurn(newChatA)?.id ?? null,
        chatBId: newChatB.id,
        chatTurnBId: getLatestTurn(newChatB)?.id ?? null,
      }),
      { chatA: newChatA, chatB: newChatB },
    );
  });

  if (newPairs.length) await SxsEvaluationPairRepository.saveAll(ctx.db, newPairs);
  return newPairs;
}
