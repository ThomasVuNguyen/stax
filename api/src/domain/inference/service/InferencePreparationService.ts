/**
 * Port of domain/inference/service/InferencePreparationService(+Impl).
 *
 * Chat turns are passed as LoadedChatTurn (ChatTurnGraph) because the Java code navigated the
 * entity graph (modelResponse.model, chat.variables, inputs). In-memory mutations mirror Java so
 * that a caller reusing the same objects (bulk loops) sees the same state.
 */
import type { Ctx } from "../../../lib/ctx";
import { IllegalArgumentException, NotFoundException, RuntimeException } from "../../../lib/errors";
import * as ModelResponseEntity from "../../../entities/ModelResponse";
import type { Model } from "../../../entities/Model";
import type { ModelInput } from "../../../entities/ModelInput";
import type { User } from "../../../entities/User";
import { InferenceStatusEnum } from "../../../enums/InferenceStatusEnum";
import { InputRole } from "../../../enums/InputRole";
import type { Prompt } from "../../../llmproviders/dto/Prompt";
import { containsVariableInput, enrichText } from "../../../util/PromptUtil";
import * as ChatService from "../../chat/service/ChatService";
import * as InferenceStatusService from "../../inferencestatus/InferenceStatusService";
import * as ModelInputRepository from "../../modelinput/ModelInputRepository";
import * as ModelResponseRepository from "../../modelresponse/ModelResponseRepository";
import * as ModelService from "../../model/service/ModelService";
import * as UserService from "../../user/UserService";
import { type InferenceContext, newInferenceContext } from "../dto/InferenceContext";
import type { InferenceDTO } from "../dto/InferenceDTO";
import {
  type LoadedChatTurn,
  asLoadedModelResponse,
  loadChatTurnsOf,
  saveChatTurn,
  setModel,
} from "./ChatTurnGraph";

// Per-request memo of user/model lookups: bulk loops prepare hundreds of rows for one user and a
// handful of models; looking them up once per row would exhaust the D1 per-invocation budget.
const userMemo = new WeakMap<Ctx, Map<string, Promise<User>>>();
const modelMemo = new WeakMap<Ctx, Map<string, Promise<Model>>>();

function memo<T>(store: WeakMap<Ctx, Map<string, Promise<T>>>, ctx: Ctx, key: string, load: () => Promise<T>): Promise<T> {
  let m = store.get(ctx);
  if (!m) store.set(ctx, (m = new Map()));
  let p = m.get(key);
  if (!p) {
    p = load();
    m.set(key, p);
    p.catch(() => m!.delete(key));
  }
  return p;
}

function findUser(ctx: Ctx, userId: string | null): Promise<User> {
  return memo(userMemo, ctx, String(userId), () => UserService.findByUserId(ctx, userId as string));
}

function findModel(ctx: Ctx, user: User, modelId: string): Promise<Model> {
  return memo(modelMemo, ctx, `${user.id}|${modelId}`, () => ModelService.getModelForUser(ctx, user, modelId));
}

/** Java NullPointerException / IndexOutOfBoundsException fell through to the RuntimeException handler. */
function javaRuntimeError(message: string): RuntimeException {
  return new RuntimeException(message);
}

export async function prepareUsingExistingModel(
  ctx: Ctx,
  chatTurn: LoadedChatTurn | null,
  dto: InferenceDTO,
): Promise<InferenceContext> {
  const user = await findUser(ctx, dto.user_id);
  if (chatTurn == null) throw new NotFoundException("Chat turn not found for user");

  let model: Model | null;
  if (chatTurn.modelResponse == null) {
    // If we're trying to run inference without model on the 1st chat turn - no way to determine a
    // model to use
    if (chatTurn.sequenceId === 1) {
      throw new IllegalArgumentException(`Can't run inference for chat turn: ${dto.chat_turn_id}`);
    }
    // If it's not the first turn, try to fall back to previous model response.
    const chatTurns = await loadChatTurnsOf(ctx.db, chatTurn.chat);
    const previousChatTurn = chatTurns[chatTurns.length - 2];
    if (!previousChatTurn) {
      throw javaRuntimeError(`Index ${chatTurns.length - 2} out of bounds for length ${chatTurns.length}`);
    }
    if (previousChatTurn.modelResponse == null) {
      throw new IllegalArgumentException(
        `Can't run inference for chat turn: ${dto.chat_turn_id} Unable to determine model to use`,
      );
    }
    model = previousChatTurn.modelResponse.model;
  } else {
    model = chatTurn.modelResponse.model;
  }
  if (model == null) throw javaRuntimeError(`Cannot invoke "com.planck.planck.entitities.Model.getId()" because "model" is null`);
  void user;

  dto.model_id = model.id;
  return newInferenceContext(model, dto);
}

export async function prepareWithExplicitModel(
  ctx: Ctx,
  chatTurn: LoadedChatTurn | null,
  dto: InferenceDTO,
  modelId: string,
  duplicateOnNoResponse: boolean,
): Promise<InferenceContext> {
  const user = await findUser(ctx, dto.user_id);
  dto.model_id = modelId;
  const model = await findModel(ctx, user, dto.model_id);

  if (chatTurn == null) throw new NotFoundException("Chat turn not found");

  // if chat turn has response - we should create the duplicate of all the chat with new chat id
  // and chat turns id with no response for the latest chat turn in the array
  if (shouldDuplicateChat(chatTurn, modelId, duplicateOnNoResponse)) {
    const newChatTurns = await ChatService.duplicateChatNewLastModelResponse(ctx, chatTurn, model);
    const size = newChatTurns.length;
    // get the latest chat turn from the created array of turns with new chat id
    const newChatTurn = newChatTurns[size > 1 ? size - 1 : 0];
    dto.chat_turn_id = newChatTurn.id;
  } else if (chatTurn.modelResponse == null || chatTurn.modelResponse.model == null) {
    await updateModelOnChatTurn(ctx, chatTurn, user, model);
  }

  return newInferenceContext(model, dto);
}

async function updateModelOnChatTurn(ctx: Ctx, chatTurn: LoadedChatTurn, user: User, model: Model): Promise<void> {
  const response = chatTurn.modelResponse ?? asLoadedModelResponse(ModelResponseEntity.create(), null);
  response.userId = user.id;
  setModel(response, model);
  response.containerId = chatTurn.chat.containerId;
  const saved = asLoadedModelResponse(await ModelResponseRepository.save(ctx.db, response), model);

  if (chatTurn.modelResponse == null) {
    chatTurn.modelResponse = saved;
    await saveChatTurn(ctx, chatTurn, user);
  }
}

function shouldDuplicateChat(chatTurn: LoadedChatTurn, targetModelId: string, duplicateIfNoResponse: boolean): boolean {
  const response = chatTurn.modelResponse;
  if (response == null || response.text == null) return duplicateIfNoResponse;
  return response.model != null && response.model.id !== targetModelId;
}

export async function createInferenceStatus(ctx: Ctx, dto: InferenceDTO): Promise<InferenceDTO> {
  const status = await InferenceStatusService.createOrUpdateInferenceStatus(ctx, dto, InferenceStatusEnum.PENDING);
  dto.inference_status_id = status.id;
  return dto;
}

function isEmptyMap(m: Record<string, string> | null | undefined): boolean {
  return m == null || Object.keys(m).length === 0;
}

function isNotBlank(s: string | null | undefined): boolean {
  return s != null && s.trim() !== "";
}

/**
 * Prompt history of `previousTurns` + `currentTurn` (inputs, then the assistant reply), without a
 * trailing assistant message, with `{{variables}}` of the current chat substituted in USER/SYSTEM
 * prompts. Inputs that use variables get the chat's variables attached and saved.
 */
export async function buildPromptHistory(
  ctx: Ctx,
  previousTurns: LoadedChatTurn[] | null,
  currentTurn: LoadedChatTurn,
): Promise<Prompt[]> {
  const variables = currentTurn.chat.variables;
  const newPrompts: Prompt[] = [];
  const inputsToSave: ModelInput[] = [];

  const allTurns: LoadedChatTurn[] = [...(previousTurns ?? []), currentTurn];
  for (const chatTurn of allTurns) {
    for (const modelInput of chatTurn.inputs ?? []) {
      if (!isEmptyMap(variables) && modelInput.text != null && containsVariableInput(modelInput.text)) {
        modelInput.variables = variables;
        inputsToSave.push(modelInput);
      }
      newPrompts.push({ role: modelInput.role, text: modelInput.text });
    }
    if (chatTurn.modelResponse != null && isNotBlank(chatTurn.modelResponse.text)) {
      newPrompts.push({ role: InputRole.ASSISTANT, text: chatTurn.modelResponse.text });
    }
  }

  if (inputsToSave.length) await ModelInputRepository.saveAll(ctx.db, inputsToSave);

  if (newPrompts.length && newPrompts[newPrompts.length - 1].role === InputRole.ASSISTANT) newPrompts.pop();

  if (isEmptyMap(variables)) return newPrompts;

  const rolesToBeEnriched: (InputRole | null)[] = [InputRole.USER, InputRole.SYSTEM];
  for (const prompt of newPrompts) {
    if (prompt.text != null && rolesToBeEnriched.includes(prompt.role)) {
      prompt.text = enrichText(prompt.text, variables);
    }
  }
  return newPrompts;
}
