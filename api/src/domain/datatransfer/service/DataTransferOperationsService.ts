/**
 * Port of domain/datatransfer/service/DataTransferOperationsService + Impl: copy chats (with all turn
 * data) or move chats between projects/datasets.
 *
 * Java's @Transactional copy saved the new chats (cascading their turns and the turns' copied
 * inference statuses) and then let ChatTurnCopyService copy inputs/responses/scores/tags. Here the
 * chats, turns and inference statuses are written in one `db.batch`, then ChatTurnCopyService runs.
 * java.lang.SecurityException → RuntimeException (500 RUNTIME_ERROR, as the Java handler did).
 */
import * as ChatEntity from "../../../entities/Chat";
import type { Chat } from "../../../entities/Chat";
import * as ChatTurnEntity from "../../../entities/ChatTurn";
import type { ChatTurn } from "../../../entities/ChatTurn";
import type { EvaluationContainer } from "../../../entities/EvaluationContainer";
import * as InferenceStatusEntity from "../../../entities/InferenceStatus";
import type { TagLink } from "../../../entities/TagLink";
import { EvaluationType } from "../../../enums/EvaluationType";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import type { Ctx } from "../../../lib/ctx";
import { allIn } from "../../../lib/db";
import { NotFoundException, RuntimeException } from "../../../lib/errors";
import * as ChatRepository from "../../chat/ChatRepository";
import * as ChatTurnRepository from "../../chatturn/ChatTurnRepository";
import * as ChatTurnCopyService from "../../chatturn/service/ChatTurnCopyService";
import * as InferenceStatusRepository from "../../inferencestatus/InferenceStatusRepository";
import * as EvaluationContainerRepository from "../../project/EvaluationContainerRepository";
import * as SxsEvaluationPairService from "../../project/SxsEvaluationPairService";
import * as TagLinkRepository from "../../tags/repository/TagLinkRepository";
import type { CopyChatErrorDetailDTO } from "../dto/CopyChatErrorDetailDTO";
import * as CopyChatsResponseDTO from "../dto/CopyChatsResponseDTO";
import * as MoveChatsResponseDTO from "../dto/MoveChatsResponseDTO";

type UserRef = { id: string | null };

export async function copyAllChatsFromProjectToProject(
  ctx: Ctx,
  sourceId: string,
  targetId: string,
  user: UserRef,
): Promise<CopyChatsResponseDTO.CopyChatsResponseDTO> {
  console.log(`User requested full chat copy: sourceId=${sourceId}, targetId=${targetId}`);
  return copyChatsInternal(ctx, sourceId, targetId, null, user);
}

export async function copySelectedChatsFromProjectToProject(
  ctx: Ctx,
  sourceId: string,
  targetId: string,
  chatIds: string[] | null,
  user: UserRef,
): Promise<CopyChatsResponseDTO.CopyChatsResponseDTO> {
  return copyChatsInternal(ctx, sourceId, targetId, chatIds, user);
}

export async function moveChatsFromSourceToTarget(
  ctx: Ctx,
  sourceId: string,
  targetId: string,
  chatIds: string[] | null,
  user: UserRef,
): Promise<MoveChatsResponseDTO.MoveChatsResponseDTO> {
  if (!chatIds || !chatIds.length) {
    return MoveChatsResponseDTO.create("No chat IDs provided to move.", 0, 0, []);
  }
  const targetContainer = await EvaluationContainerRepository.findById(ctx.db, targetId);
  if (!targetContainer) throw new NotFoundException("Target container not found: " + targetId);
  if (targetContainer.userId !== user.id) {
    throw new RuntimeException("User does not have access to the target container.");
  }

  const chatsToBeMoved = await ChatRepository.findByUserAndIdIn(ctx.db, user.id as string, chatIds);
  const turnCounts = await countTurnsByChat(ctx, chatsToBeMoved.map((c) => c.id as string));
  const errors: CopyChatErrorDetailDTO[] = [];
  const validChatsToMove: Chat[] = [];
  let successfullyMovedTurns = 0;
  for (const requestedChatId of chatIds) {
    const chat = chatsToBeMoved.find((c) => c.id === requestedChatId);
    if (!chat) {
      errors.push({ originalChatId: requestedChatId, errorReason: "MOVE_FAILED: Chat not found or does not belong to the user." });
    } else if (chat.containerId === sourceId) {
      validChatsToMove.push(chat);
      successfullyMovedTurns += turnCounts.get(chat.id as string) ?? 0;
    } else {
      errors.push({ originalChatId: requestedChatId, errorReason: "MOVE_FAILED: Chat does not belong to the source container." });
    }
  }
  for (const chat of validChatsToMove) chat.containerId = targetContainer.id;
  if (validChatsToMove.length) await ChatRepository.saveAll(ctx.db, validChatsToMove);

  const message = `Move operation processed. ${validChatsToMove.length} of ${chatIds.length} chats moved (total ${successfullyMovedTurns} turns).`;
  return MoveChatsResponseDTO.create(message, validChatsToMove.length, errors.length, errors);
}

async function countTurnsByChat(ctx: Ctx, chatIds: string[]): Promise<Map<string, number>> {
  const rows = await allIn<{ chat_id: string; n: number }>(
    ctx.db,
    (inn) => `SELECT chat_id, COUNT(*) AS n FROM chat_turns WHERE chat_id IN ${inn} GROUP BY chat_id`,
    [...new Set(chatIds)],
  );
  return new Map(rows.map((r) => [r.chat_id, r.n]));
}

async function copyChatsInternal(
  ctx: Ctx,
  sourceId: string,
  targetId: string,
  chatIds: string[] | null,
  user: UserRef,
): Promise<CopyChatsResponseDTO.CopyChatsResponseDTO> {
  const sourceContainer = await EvaluationContainerRepository.findById(ctx.db, sourceId);
  if (!sourceContainer) throw new NotFoundException("Source container not found: " + sourceId);
  const targetContainer = await EvaluationContainerRepository.findById(ctx.db, targetId);
  if (!targetContainer) throw new NotFoundException("Target container not found: " + targetId);
  if (sourceContainer.userId !== user.id || targetContainer.userId !== user.id) {
    throw new RuntimeException("User does not have access to one of the containers.");
  }

  const chatIdsToCopy =
    chatIds && chatIds.length
      ? [...new Set(chatIds)]
      : await ChatTurnRepository.findAllChatIdsByUserAndContainer(ctx.db, user.id as string, sourceContainer.id as string);
  if (!chatIdsToCopy.length) {
    return CopyChatsResponseDTO.create("Source container has no chats to copy.", 0, 0, {}, []);
  }
  console.log(`Copying ${chatIdsToCopy.length} chat(s) from container ${sourceId} to ${targetId}`);
  return doCopyChatsInBatch(ctx, chatIdsToCopy, targetContainer, user);
}

async function doCopyChatsInBatch(
  ctx: Ctx,
  sourceChatIdsToCopy: string[],
  targetContainer: EvaluationContainer,
  user: UserRef,
): Promise<CopyChatsResponseDTO.CopyChatsResponseDTO> {
  const db = ctx.db;
  const allSourceTurns = await ChatTurnRepository.findForCopy(db, sourceChatIdsToCopy);
  if (!allSourceTurns.length) {
    return CopyChatsResponseDTO.create("No source content found to copy.", 0, 0, {}, []);
  }
  const sourceTurnIds = allSourceTurns.map((t) => t.id as string);

  const tagsByTurnId = new Map<string, TagLink[]>();
  for (const link of await TagLinkRepository.findByTargetIdsAndTargetType(
    db,
    sourceTurnIds,
    TagLinkTargetType.CHAT_TURN,
    user.id as string,
  )) {
    const list = tagsByTurnId.get(link.targetId as string) ?? [];
    list.push(link);
    tagsByTurnId.set(link.targetId as string, list);
  }

  const sourceTurnsByChatId = new Map<string, ChatTurn[]>();
  for (const turn of allSourceTurns) {
    const list = sourceTurnsByChatId.get(turn.chatId as string) ?? [];
    list.push(turn);
    sourceTurnsByChatId.set(turn.chatId as string, list);
  }
  const sourceChats = new Map(
    (await allIn(db, (inn) => `SELECT * FROM chat WHERE id IN ${inn}`, [...sourceTurnsByChatId.keys()])).map((r) => {
      const chat = ChatEntity.fromRow(r);
      return [chat.id, chat] as const;
    }),
  );
  const statusByTurnId = new Map(
    (await InferenceStatusRepository.findAllByChatTurnIdIn(db, sourceTurnIds)).map((s) => [s.chatTurnId, s]),
  );

  const errors: CopyChatErrorDetailDTO[] = [];
  const copiedChatIdMappings: Record<string, string> = {};
  const newChatsToSave: { chat: Chat; turns: ChatTurn[]; sourceChatId: string }[] = [];
  const sourceToTargetTurnMap = new Map<ChatTurn, ChatTurn>();
  const stmts: D1PreparedStatement[] = [];

  for (const sourceChatId of sourceChatIdsToCopy) {
    const sourceTurnsForThisChat = sourceTurnsByChatId.get(sourceChatId);
    if (!sourceTurnsForThisChat || !sourceTurnsForThisChat.length) {
      errors.push({ originalChatId: sourceChatId, errorReason: "SOURCE_CHAT_ID_NOT_FOUND_OR_EMPTY" });
      continue;
    }
    const sourceChat = sourceChats.get(sourceChatId);
    const newChat = ChatEntity.create({
      userId: user.id,
      containerId: targetContainer.id,
      variables: sourceChat ? sourceChat.variables : {},
    });
    ChatEntity.prePersist(newChat);
    const newTurns: ChatTurn[] = [];
    for (const sourceTurn of sourceTurnsForThisChat) {
      const newTurn = ChatTurnEntity.create({ chatId: newChat.id });
      ChatTurnEntity.copyFromExisting(newTurn, sourceTurn);
      newTurns.push(newTurn);
      sourceToTargetTurnMap.set(sourceTurn, newTurn);
    }
    newChatsToSave.push({ chat: newChat, turns: newTurns, sourceChatId });
  }

  try {
    for (const { chat, turns } of newChatsToSave) {
      stmts.push(ChatRepository.saveStmt(db, chat));
      for (const turn of turns) stmts.push(ChatTurnRepository.saveStmt(db, turn));
    }
    // ChatTurn.copyFromExisting also deep-copied the turn's inference status (cascade on save).
    for (const [sourceTurn, newTurn] of sourceToTargetTurnMap) {
      const status = statusByTurnId.get(sourceTurn.id);
      if (status) {
        stmts.push(
          InferenceStatusRepository.saveStmt(
            db,
            InferenceStatusEntity.deepCopy(status, newTurn.id, targetContainer.id),
          ),
        );
      }
    }
    if (stmts.length) await db.batch(stmts);
    for (const { chat, turns, sourceChatId } of newChatsToSave) {
      if (turns.length) copiedChatIdMappings[sourceChatId] = chat.id as string;
    }

    await ChatTurnCopyService.copyAllChatTurnRelatedEntities(ctx, sourceToTargetTurnMap, user, tagsByTurnId);
    if (targetContainer.evaluationType === EvaluationType.SXS) {
      await SxsEvaluationPairService.createSxsEvaluationPairs(
        ctx,
        newChatsToSave.map((c) => ({ ...c.chat, turns: c.turns })),
        targetContainer,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed during batch copy to container '${targetContainer.id}'. Error: ${msg}`);
    return CopyChatsResponseDTO.create(
      "Batch copy failed with internal error: " + msg,
      0,
      sourceChatIdsToCopy.length,
      {},
      errors,
    );
  }

  let message = `Copy operation processed. ${newChatsToSave.length} of ${sourceChatIdsToCopy.length} chats copied (total ${allSourceTurns.length} turns).`;
  if (errors.length) message += " Some errors occurred. Check error details.";
  return CopyChatsResponseDTO.create(message, newChatsToSave.length, errors.length, copiedChatIdMappings, errors);
}
