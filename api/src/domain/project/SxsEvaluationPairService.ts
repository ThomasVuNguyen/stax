/**
 * Port of domain/project/SxsEvaluationPairService(+Impl). Signatures mirror Java (`User user` → any
 * `{ id }`, e.g. `requireUser(ctx)`); `createSxsEvaluationPairs` also accepts the user omitted
 * (`requireUser(ctx)`), as its datatransfer caller uses that form.
 *
 * Overloads / notes:
 * - `createSxsPair(user, containerId, prompt, expectedOutput)` keeps the name;
 *   the Impl-only `createSxsPair(user, containerId, chatTurnIdA, chatTurnIdB, expectedOutput,
 *   variables)` is `createSxsPairFromTurnIds`.
 * - Entities are flat (relations are ids). `synchronizeSxsPairChats` mutates and returns the pair
 *   (chatTurnAId / chatTurnBId); `createSxsEvaluationPairs` accepts chats with an optional loaded
 *   `turns` list and loads the turns otherwise.
 * - D1 has no transactions: multi-step writes run sequentially (batched where possible).
 */
import type { Ctx } from "../../lib/ctx";
import { requireUser } from "../../lib/ctx";
import { IllegalArgumentException, IllegalInputException, NotFoundException, RuntimeException } from "../../lib/errors";
import * as ChatEntity from "../../entities/Chat";
import type { Chat } from "../../entities/Chat";
import * as ChatTurnEntity from "../../entities/ChatTurn";
import type { ChatTurn } from "../../entities/ChatTurn";
import type { EvaluationContainer } from "../../entities/EvaluationContainer";
import type { Model } from "../../entities/Model";
import * as ModelInputEntity from "../../entities/ModelInput";
import type { ModelInput } from "../../entities/ModelInput";
import * as ModelResponseEntity from "../../entities/ModelResponse";
import * as SxsEvaluationPairEntity from "../../entities/SxsEvaluationPair";
import type { SxsEvaluationPair } from "../../entities/SxsEvaluationPair";
import { EvaluationType } from "../../enums/EvaluationType";
import { InputRole } from "../../enums/InputRole";
import { TagLinkTargetType } from "../../enums/TagLinkTargetType";
import type { Prompt } from "../../llmproviders/dto/Prompt";
import * as ChatRepository from "../chat/ChatRepository";
import * as ChatService from "../chat/service/ChatService";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import * as SXSHumanFeedbackRepository from "../evaluation/SXSHumanFeedbackRepository";
import * as SxsEvaluationPairRepository from "../evaluation/SxsEvaluationPairRepository";
import * as ModelService from "../model/service/ModelService";
import * as ModelInputRepository from "../modelinput/ModelInputRepository";
import * as ModelResponseRepository from "../modelresponse/ModelResponseRepository";
import * as TagLinkService from "../tags/TagLinkService";
import * as SXSWorkbookDTO from "../workbook/dto/SXSWorkbookDTO";
import { loadChatTurns, loadPairwiseScoresByPairIds } from "../workbook/dto/BaseWorkbookRowDTO";
import * as SXSChatRowDTO from "./dto/SXSChatRowDTO";
import * as EvaluationContainerRepository from "./EvaluationContainerRepository";

const notSxsContainer = () => new IllegalInputException("Evaluation pairs can only be created in SxS containers.");

type UserRef = { id: string | null };
const uid = (user: UserRef) => user.id as string;

async function containerForUser(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  message: string,
): Promise<EvaluationContainer> {
  const container = await EvaluationContainerRepository.findByIdAndUser(ctx.db, containerId, uid(user));
  if (!container) throw new NotFoundException(message);
  return container;
}

export async function createSxsPair(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  promptInput: Prompt | null,
  expectedOutput: string | null,
): Promise<SxsEvaluationPair> {
  const container = await containerForUser(ctx, user, containerId, "Evaluation Container not found with id: " + containerId);
  if (container.evaluationType !== EvaluationType.SXS) {
    throw new NotFoundException("Evaluation container is not an SxS");
  }

  let modelInput: ModelInput | null = null;
  if (promptInput != null) {
    modelInput = await ModelInputRepository.save(ctx.db, ModelInputEntity.fromPrompt(promptInput, uid(user)));
  }

  const turnA = await createInitialTurnForSXS(ctx, user, container, modelInput);
  const turnB = await createInitialTurnForSXS(ctx, user, container, modelInput);
  return createAndSaveSxsPair(ctx, container, turnA, turnB, expectedOutput, null);
}

export async function createSxsPairFromTurnIds(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  chatTurnIdA: string,
  chatTurnIdB: string | null,
  expectedOutput: string | null,
  variables: Record<string, string> | null,
): Promise<SxsEvaluationPair> {
  const container = await containerForUser(ctx, user, containerId, "Evaluation Container not found with id: " + containerId);
  if (container.evaluationType !== EvaluationType.SXS) throw notSxsContainer();

  const turnA = await ChatTurnRepository.findByIdAndUser(ctx.db, chatTurnIdA, uid(user));
  if (!turnA) throw new NotFoundException("ChatTurn A not found with id: " + chatTurnIdA);

  let turnB: ChatTurn | null = null;
  if (chatTurnIdB != null && chatTurnIdB.trim() !== "") {
    turnB = await ChatTurnRepository.findByIdAndUser(ctx.db, chatTurnIdB, uid(user));
    if (!turnB) throw new NotFoundException("ChatTurn B not found with id: " + chatTurnIdB);
  }
  return createAndSaveSxsPair(ctx, container, turnA, turnB, expectedOutput, variables);
}

async function createAndSaveSxsPair(
  ctx: Ctx,
  container: EvaluationContainer,
  turnA: ChatTurn,
  turnB: ChatTurn | null,
  expectedOutput: string | null,
  variables: Record<string, string> | null,
): Promise<SxsEvaluationPair> {
  const pair = SxsEvaluationPairEntity.create({
    containerId: container.id,
    userId: container.userId,
    chatAId: turnA.chatId,
    chatTurnAId: turnA.id,
    chatBId: turnB ? turnB.chatId : null,
    chatTurnBId: turnB ? turnB.id : null,
    expectedOutput: expectedOutput ?? null,
    variables: variables ?? null,
  });
  return SxsEvaluationPairRepository.save(ctx.db, pair);
}

export async function getSxsPairById(ctx: Ctx, pairId: string, user: UserRef): Promise<SxsEvaluationPair> {
  const pair = await SxsEvaluationPairRepository.findByIdAndUser(ctx.db, pairId, uid(user));
  if (!pair) throw new NotFoundException("SxsEvaluationPair not found with id: " + pairId);
  return pair;
}

export async function getSXSRowsForPair(
  ctx: Ctx,
  user: UserRef,
  _containerId: string,
  pairId: string,
): Promise<SXSChatRowDTO.SXSChatRowDTO[]> {
  const pair = await getSxsPairById(ctx, pairId, user);
  const chatIds = [pair.chatAId, pair.chatBId].filter((x): x is string => !!x);
  const chatTurns = await ChatTurnRepository.findChatTurnsByChatList(ctx.db, chatIds, uid(user));
  const bySequence = (a: ChatTurn, b: ChatTurn) => (a.sequenceId ?? 0) - (b.sequenceId ?? 0);
  const sideATurns = chatTurns.filter((t) => t.chatId === pair.chatAId).sort(bySequence);
  const sideBTurns = chatTurns.filter((t) => pair.chatBId != null && t.chatId === pair.chatBId).sort(bySequence);

  // Java enriched only pair.getChatTurnA()/getChatTurnB(), which the persistence context made the
  // same instances as the listed turns with those ids.
  const pairTurns = chatTurns.filter((t) => t.id === pair.chatTurnAId || t.id === pair.chatTurnBId);
  await ChatService.enrichTurnsWithSystemInstructions(ctx, pairTurns);

  const [loadedA, loadedB, pairwiseScores] = await Promise.all([
    loadChatTurns(ctx.db, sideATurns),
    loadChatTurns(ctx.db, sideBTurns),
    loadPairwiseScoresByPairIds(ctx.db, [pair.id as string]),
  ]);
  const scores = pairwiseScores.get(pair.id as string) ?? [];

  const rows: SXSChatRowDTO.SXSChatRowDTO[] = [];
  const maxTurns = Math.max(loadedA.length, loadedB.length);
  for (let i = 0; i < maxTurns; i++) {
    rows.push(
      SXSChatRowDTO.build(
        {
          id: pair.id,
          expectedOutput: pair.expectedOutput,
          chatTurnA: i < loadedA.length ? loadedA[i] : null,
          chatTurnB: i < loadedB.length ? loadedB[i] : null,
          pairwiseScores: scores,
        },
        null,
      ),
    );
  }
  await SXSChatRowDTO.applyRowTags(ctx, user, rows);
  return rows;
}

export async function deleteSxsPair(ctx: Ctx, pairId: string, user: UserRef): Promise<void> {
  const pair = await getSxsPairById(ctx, pairId, user);
  await deletePairsAndAssociatedData(ctx, [pair]);
}

export async function generateAndSetTurnB(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  pairId: string,
  modelId: string,
  createEmptyLastResponse: boolean,
): Promise<SxsEvaluationPair> {
  const pair = await getSxsPairById(ctx, pairId, user);
  await validateGenerateTurnB(ctx, containerId, pairId, pair);

  if (pair.chatTurnAId == null) {
    throw new RuntimeException("Cannot generate Side B because Side A is missing.");
  }
  const sourceTurnA = await ChatTurnRepository.findById(ctx.db, pair.chatTurnAId);
  if (!sourceTurnA) throw new RuntimeException("Cannot generate Side B because Side A is missing.");
  const modelForB = await ModelService.getModelForUser(ctx, user, modelId);

  if (pair.chatTurnBId != null) {
    await assignModelToTurnB(ctx, pair, modelForB);
  } else {
    await createTurnBfromTurnA(ctx, createEmptyLastResponse, pair, sourceTurnA, modelForB);
  }
  return SxsEvaluationPairRepository.save(ctx.db, pair);
}

export async function getSXSRows(
  ctx: Ctx,
  user: UserRef,
  containerId: string,
  pageSize: number,
  pageToken: number,
  _orderBy: string | null,
  _filter: string | null,
  _tagIds: string[] | null,
): Promise<SXSWorkbookDTO.SXSWorkbookDTO> {
  const container = await containerForUser(ctx, user, containerId, "Evaluation container not found for this user");
  const effectivePageSize = Math.min(pageSize < 1 ? 10000 : pageSize, 10000);
  const sxsPage = await SxsEvaluationPairRepository.findByContainerWithLatestTurns(
    ctx.db,
    container.id as string,
    uid(user),
    { page: pageToken, size: effectivePageSize, sort: [{ property: "createdAt", direction: "DESC" }] },
  );
  const sxsRows = await SXSChatRowDTO.fromList(ctx, sxsPage.content, user);
  const nextPageToken = sxsPage.number + 1 < sxsPage.totalPages ? String(sxsPage.number + 1) : null;
  return SXSWorkbookDTO.create(sxsRows, nextPageToken, sxsPage.totalElements);
}

async function assignModelToTurnB(ctx: Ctx, pair: SxsEvaluationPair, modelForB: Model): Promise<void> {
  const turnB = await ChatTurnRepository.findById(ctx.db, pair.chatTurnBId as string);
  if (!turnB) return;
  const existing = turnB.modelResponseId ? await ModelResponseRepository.findById(ctx.db, turnB.modelResponseId) : null;
  const modelResponse = existing ?? ModelResponseEntity.create();
  modelResponse.modelId = modelForB.id;
  modelResponse.userId = turnB.userId;
  modelResponse.containerId = pair.containerId;
  await ModelResponseRepository.save(ctx.db, modelResponse);
  turnB.modelResponseId = modelResponse.id;
  await ChatTurnRepository.save(ctx.db, turnB);
}

async function createTurnBfromTurnA(
  ctx: Ctx,
  createEmptyLastResponse: boolean,
  pair: SxsEvaluationPair,
  sourceTurnA: ChatTurn,
  modelForB: Model,
): Promise<void> {
  const newChatBTurns: ChatTurn[] = createEmptyLastResponse
    ? await ChatService.duplicateChatNewLastModelResponse(ctx, sourceTurnA, modelForB)
    : await ChatService.duplicateChatWithNewModel(ctx, sourceTurnA, modelForB);
  if (!newChatBTurns.length) throw new RuntimeException("Failed to duplicate chat for Side B.");
  const finalTurnB = newChatBTurns.reduce((max, t) => ((t.sequenceId ?? 0) > (max.sequenceId ?? 0) ? t : max));
  pair.chatBId = finalTurnB.chatId;
  pair.chatTurnBId = finalTurnB.id;
}

async function validateGenerateTurnB(ctx: Ctx, containerId: string, pairId: string, pair: SxsEvaluationPair) {
  if (pair.containerId !== containerId) {
    throw new NotFoundException(`SxS Pair with id ${pairId} does not belong to container ${containerId}`);
  }
  const container = await EvaluationContainerRepository.findById(ctx.db, pair.containerId as string);
  if (container?.evaluationType !== EvaluationType.SXS) throw notSxsContainer();

  if (pair.chatTurnBId != null) {
    const turnB = await ChatTurnRepository.findById(ctx.db, pair.chatTurnBId);
    const response = turnB?.modelResponseId ? await ModelResponseRepository.findById(ctx.db, turnB.modelResponseId) : null;
    if (response && response.text != null) {
      throw new RuntimeException("Side B already has a model with response");
    }
  }
}

export async function updateSxsPair(
  ctx: Ctx,
  pairId: string,
  containerId: string,
  user: UserRef,
  input: string | null | undefined,
  expectedOutput: string | null | undefined,
  variables: Record<string, string> | null | undefined,
  tagIds: string[] | null | undefined,
): Promise<SxsEvaluationPair> {
  const pair = await getSxsPairById(ctx, pairId, user);
  if (pair.containerId !== containerId) {
    throw new NotFoundException("SxsEvaluationPair not found with id: " + pairId);
  }
  const turnIds = [pair.chatTurnAId, pair.chatTurnBId].filter((x): x is string => !!x);
  const turns = await ChatTurnRepository.findAllById(ctx.db, turnIds);
  const [loadedA, loadedB] = await Promise.all([
    loadTurnWithInputs(ctx, turns.find((t) => t.id === pair.chatTurnAId) ?? null),
    loadTurnWithInputs(ctx, turns.find((t) => t.id === pair.chatTurnBId) ?? null),
  ]);
  const turnA = loadedA as TurnWithInputs; // Side A always exists on a pair
  const turnB = loadedB;

  if (input != null) {
    validateNoResponseExists(turnA, turnB);
    await updateInputForTurn(ctx, turnA, input);
    if (turnB) await updateInputForTurn(ctx, turnB, input);
  }

  if (expectedOutput != null) {
    pair.expectedOutput = expectedOutput;
    await updateExpectedOutputForTurn(ctx, turnA, expectedOutput);
    if (turnB) await updateExpectedOutputForTurn(ctx, turnB, expectedOutput);
  }

  if (variables != null) {
    pair.variables = variables;
    await updateMetadataForChat(ctx, turnA.chatId, variables);
    if (turnB) await updateMetadataForChat(ctx, turnB.chatId, variables);
  }

  if (tagIds != null) {
    await TagLinkService.updateTagsForEntity(ctx, user, tagIds, TagLinkTargetType.CHAT, pair.chatAId as string);
    if (turnB) {
      await TagLinkService.updateTagsForEntity(ctx, user, tagIds, TagLinkTargetType.CHAT, pair.chatBId as string);
    }
  }

  return SxsEvaluationPairRepository.save(ctx.db, pair);
}

interface TurnWithInputs extends ChatTurn {
  inputs: ModelInput[];
  responseText: string | null;
}

async function loadTurnWithInputs(ctx: Ctx, turn: ChatTurn | null): Promise<TurnWithInputs | null> {
  if (!turn) return null;
  const [inputs, response] = await Promise.all([
    ChatTurnRepository.findInputsByTurnId(ctx.db, turn.id as string),
    turn.modelResponseId ? ModelResponseRepository.findById(ctx.db, turn.modelResponseId) : Promise.resolve(null),
  ]);
  return { ...turn, inputs, responseText: response?.text ?? null };
}

function validateNoResponseExists(turnA: TurnWithInputs | null, turnB: TurnWithInputs | null): void {
  if (responseExists(turnA) || responseExists(turnB)) {
    throw new IllegalArgumentException(
      turnB == null
        ? "Cannot update input: a model response already exists for Side A."
        : "Cannot update input: a model response already exists for Side A or Side B.",
    );
  }
}

function responseExists(turn: TurnWithInputs | null): boolean {
  return turn?.responseText != null && turn.responseText.trim() !== "";
}

/** Java threw a NullPointerException (→ 500) when the turn had inputs but no USER input. */
function lastUserInputOrFail(turn: TurnWithInputs): ModelInput {
  const input = ChatTurnEntity.getLastUserInput(turn);
  if (!input) throw new RuntimeException("Cannot invoke \"com.planck.planck.entitities.ModelInput.setText\" because \"userInput\" is null");
  return input;
}

async function updateInputForTurn(ctx: Ctx, turn: TurnWithInputs, newInput: string): Promise<void> {
  if (turn.inputs.length) {
    const userInput = lastUserInputOrFail(turn);
    userInput.text = newInput;
    await ModelInputRepository.save(ctx.db, userInput);
  } else {
    const prompt: Prompt = { role: InputRole.USER, text: newInput };
    const userInput = ModelInputEntity.fromPrompt(prompt, turn.userId);
    turn.inputs.push(userInput);
    // ModelInput save + the turn's turn_inputs link (cascade of ChatTurn.inputs at commit).
    await ChatTurnRepository.saveInputs(ctx.db, turn.id as string, turn.inputs);
  }
}

async function updateExpectedOutputForTurn(ctx: Ctx, turn: TurnWithInputs, newExpectedOutput: string): Promise<void> {
  const userInput = ChatTurnEntity.getLastUserInput(turn);
  if (!userInput) {
    throw new RuntimeException(
      "Cannot invoke \"com.planck.planck.entitities.ModelInput.setExpectedOutput(String)\" because \"userInput\" is null",
    );
  }
  userInput.expectedOutput = newExpectedOutput;
  await ModelInputRepository.save(ctx.db, userInput);
}

async function updateMetadataForChat(ctx: Ctx, chatId: string | null, newVariables: Record<string, string>) {
  if (!chatId) return;
  const chat = await ChatRepository.findById(ctx.db, chatId);
  if (!chat) return;
  chat.variables = newVariables;
  await ChatRepository.save(ctx.db, chat);
}

/** `new Chat()` + `new ChatTurn(user, chat, 0, modelInput, null)` saved through the chat cascade. */
async function createInitialTurnForSXS(
  ctx: Ctx,
  user: UserRef,
  container: EvaluationContainer,
  modelInput: ModelInput | null,
): Promise<ChatTurn> {
  const chat = ChatEntity.create({ containerId: container.id, userId: uid(user) });
  ChatEntity.prePersist(chat);
  const chatTurn = ChatTurnEntity.create({ userId: uid(user), chatId: chat.id, sequenceId: 0 });
  ChatTurnEntity.prePersist(chatTurn);
  await ctx.db.batch([
    ChatRepository.saveStmt(ctx.db, chat),
    ChatTurnRepository.saveStmt(ctx.db, chatTurn),
    ...ChatTurnRepository.saveInputsStmts(ctx.db, chatTurn.id as string, modelInput ? [modelInput] : []),
  ]);
  return chatTurn;
}

export async function deleteSxsPairsByIds(ctx: Ctx, pairIds: string[] | null | undefined, user: UserRef): Promise<void> {
  if (!pairIds || !pairIds.length) return;
  const pairsToDelete = await SxsEvaluationPairRepository.findByIdsAndUser(ctx.db, pairIds, uid(user));
  await deletePairsAndAssociatedData(ctx, pairsToDelete);
}

export async function deleteSxsPairsByContainer(ctx: Ctx, containerId: string, user: UserRef): Promise<void> {
  const container = await containerForUser(ctx, user, containerId, "Evaluation container not found for this user");
  const pairsToDelete = await SxsEvaluationPairRepository.findByContainer(ctx.db, container.id as string);
  await deletePairsAndAssociatedData(ctx, pairsToDelete);
}

/**
 * Deletes every turn of the pairs' chats (the pairs themselves go with them: FK ON DELETE CASCADE
 * on sxs_evaluation_pair.chat_turn_id_a/b) and the pairs' human feedback.
 */
async function deletePairsAndAssociatedData(ctx: Ctx, pairs: SxsEvaluationPair[]): Promise<void> {
  if (!pairs.length) return;
  const chatIds = [...new Set(pairs.flatMap((p) => [p.chatAId, p.chatBId]).filter((x): x is string => !!x))];
  if (chatIds.length) {
    const turnsToDelete = await ChatTurnRepository.findByChatIn(ctx.db, chatIds);
    await ChatService.delete(ctx, turnsToDelete);
    await SXSHumanFeedbackRepository.deleteByPairIdList(
      ctx.db,
      pairs.map((p) => p.id).filter((x): x is string => !!x),
    );
  }
}

export async function synchronizeSxsPairChats(
  ctx: Ctx,
  pair: SxsEvaluationPair,
  user: UserRef,
  modelIdA: string | null,
  modelIdB: string | null,
): Promise<SxsEvaluationPair> {
  const [turnA, turnB] = await Promise.all([turnById(ctx, pair.chatTurnAId), turnById(ctx, pair.chatTurnBId)]);
  let turnsA = await ChatService.getFullChatHistory(ctx, turnA);
  let turnsB = await ChatService.getFullChatHistory(ctx, turnB);

  await synchronizeCommonTurns(ctx, turnsA, turnsB, user, modelIdA, modelIdB);

  turnsA = await ChatService.getFullChatHistory(ctx, turnA);
  turnsB = await ChatService.getFullChatHistory(ctx, turnB);

  const container = await EvaluationContainerRepository.findById(ctx.db, pair.containerId as string);
  if (turnsA.length > turnsB.length) {
    const chatB = await ChatRepository.findById(ctx.db, pair.chatBId as string);
    const newLastTurnB = await ChatService.appendMissingTurns(ctx, chatB, turnsA, container, turnsB.length);
    pair.chatTurnBId = newLastTurnB.id;
  } else if (turnsB.length > turnsA.length) {
    const chatA = await ChatRepository.findById(ctx.db, pair.chatAId as string);
    const newLastTurnA = await ChatService.appendMissingTurns(ctx, chatA, turnsB, container, turnsA.length);
    pair.chatTurnAId = newLastTurnA.id;
  }
  return pair;
}

async function turnById(ctx: Ctx, id: string | null): Promise<ChatTurn | null> {
  return id ? ChatTurnRepository.findById(ctx.db, id) : null;
}

async function synchronizeCommonTurns(
  ctx: Ctx,
  turnsA: ChatTurn[],
  turnsB: ChatTurn[],
  user: UserRef,
  modelIdA: string | null,
  modelIdB: string | null,
): Promise<void> {
  const commonSize = Math.min(turnsA.length, turnsB.length);
  const responseIds = [...turnsA, ...turnsB].map((t) => t.modelResponseId).filter((x): x is string => !!x);
  const responses = await ModelResponseRepository.findAllById(ctx.db, [...new Set(responseIds)]);
  const textById = new Map(responses.map((r) => [r.id as string, r.text]));
  const isResponseMissing = (t: ChatTurn) => t.modelResponseId == null || textById.get(t.modelResponseId) == null;

  for (let i = 0; i < commonSize; i++) {
    const turnA = turnsA[i];
    const turnB = turnsB[i];
    const isLastCommonTurn = i === commonSize - 1;
    const missingA = isResponseMissing(turnA);
    const missingB = isResponseMissing(turnB);
    if (missingB && !missingA) {
      const model = await resolveModelForSide(ctx, user, turnsB, isLastCommonTurn ? modelIdB : null);
      await ChatService.copyResponseToTurn(ctx, turnA, turnB, model);
    } else if (missingA && !missingB) {
      const model = await resolveModelForSide(ctx, user, turnsA, isLastCommonTurn ? modelIdA : null);
      await ChatService.copyResponseToTurn(ctx, turnB, turnA, model);
    }
  }
}

async function resolveModelForSide(
  ctx: Ctx,
  user: UserRef,
  turns: ChatTurn[],
  modelIdFromRequest: string | null,
): Promise<Model> {
  if (modelIdFromRequest != null) return ModelService.getModelForUser(ctx, user, modelIdFromRequest);
  const model = await ChatService.getModelFromChatHistory(ctx, turns);
  if (!model) throw new RuntimeException("Cannot determine model for the side.");
  return model;
}

type ChatWithTurns = Chat & { turns?: ChatTurn[] | null };

export async function createSxsEvaluationPairs(
  ctx: Ctx,
  user: UserRef,
  targetChats: ChatWithTurns[],
  container: EvaluationContainer,
): Promise<void>;
export async function createSxsEvaluationPairs(
  ctx: Ctx,
  targetChats: ChatWithTurns[],
  container: EvaluationContainer,
): Promise<void>;
export async function createSxsEvaluationPairs(
  ctx: Ctx,
  ...args: [UserRef, ChatWithTurns[], EvaluationContainer] | [ChatWithTurns[], EvaluationContainer]
): Promise<void> {
  const [user, targetChats, container] =
    args.length === 3 ? args : ([requireUser(ctx), args[0], args[1]] as [UserRef, ChatWithTurns[], EvaluationContainer]);
  if (container.evaluationType !== EvaluationType.SXS) return;

  const sideB: Map<string, ChatWithTurns> = await ChatService.duplicateChatsForSideB(ctx, targetChats, user);

  // Chat#getTurns(): use the loaded turns when the caller has them, otherwise read them.
  const missing = [
    ...targetChats.filter((c) => !c.turns).map((c) => c.id),
    ...[...sideB.values()].filter((c) => !c.turns).map((c) => c.id),
  ].filter((x): x is string => !!x);
  const loaded = missing.length ? await ChatTurnRepository.findByChatIn(ctx.db, missing) : [];
  const turnsOf = (chat: ChatWithTurns) =>
    chat.turns ?? loaded.filter((t) => t.chatId === chat.id);

  const pairs: SxsEvaluationPair[] = [];
  for (const chat of targetChats) {
    const sideBChat = sideB.get(chat.id as string) ?? null;
    const sideBTurns = sideBChat ? turnsOf(sideBChat) : [];
    for (const chatTurn of turnsOf(chat)) {
      const sideBChatTurn = sideBTurns.find((t) => t.sequenceId === chatTurn.sequenceId) ?? null;
      pairs.push(
        SxsEvaluationPairEntity.create({
          chatAId: chat.id,
          chatTurnAId: chatTurn.id,
          chatBId: sideBChat ? sideBChat.id : null,
          chatTurnBId: sideBChatTurn ? sideBChatTurn.id : null,
          containerId: container.id,
          userId: uid(user),
        }),
      );
    }
  }
  await SxsEvaluationPairRepository.saveAll(ctx.db, pairs);
}
