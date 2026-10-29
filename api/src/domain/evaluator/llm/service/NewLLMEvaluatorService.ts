/**
 * Port of domain/evaluator/llm/service/NewLLMEvaluatorService(+Impl).
 * `user` arguments only need an `id` (AuthUser or User entity).
 * Response DTO helpers that load the model + inputs: `toResponseDTO(ctx, e)`, `toResponseDTOs(ctx, es)`.
 */
import type { Ctx } from "../../../../lib/ctx";
import { EvaluatorNameExistException, IllegalInputException, NotFoundException } from "../../../../lib/errors";
import { type LLMEvaluator, create } from "../../../../entities/LLMEvaluator";
import type { Model } from "../../../../entities/Model";
import * as ModelInputEntity from "../../../../entities/ModelInput";
import type { ModelInput } from "../../../../entities/ModelInput";
import { ScopeType } from "../../../../enums/ScopeType";
import type { Prompt } from "../../../../llmproviders/dto/Prompt";
import { SCRORE_NAME_ALREADY_EXIST } from "../../../../util/CustomScorerStringConstant";
import * as EvaluationStatusRepository from "../../../evaluationstatus/EvaluationStatusRepository";
import * as ModelRepository from "../../../model/ModelRepository";
import * as ModelService from "../../../model/service/ModelService";
import * as EvaluatorVariableDTO from "../../dto/EvaluatorVariableDTO";
import * as OutputCategoryDTO from "../../dto/OutputCategoryDTO";
import * as LLMEvaluatorRepository from "../LLMEvaluatorRepository";
import type { LLMEvaluatorRequestDTO } from "../dto/LLMEvaluatorRequestDTO";
import { type LLMEvaluatorResponseDTO, fromLLMEvaluator } from "../dto/LLMEvaluatorResponseDTO";
import type { LLMEvaluatorUpdateDTO } from "../dto/LLMEvaluatorUpdateDTO";

type UserRef = { id: string | null };

/** Jackson serialisation of the request lists (a missing list is stored as the text "null"). */
export function variablesJson(v: unknown[] | null | undefined): string {
  return JSON.stringify(EvaluatorVariableDTO.normalizeList(v as never) ?? null);
}

export function outputCategoriesJson(v: unknown[] | null | undefined): string {
  return JSON.stringify(OutputCategoryDTO.normalizeList(v as never) ?? null);
}

/** `ModelInputService.savePrompt(user, prompt)` for each prompt: new ModelInput rows (saved with the join rows). */
export function createModelInputsFromPrompts(prompts: Prompt[], user: UserRef): ModelInput[] {
  return prompts.map((p) => ModelInputEntity.fromPrompt(p, user.id));
}

export async function toResponseDTO(ctx: Ctx, e: LLMEvaluator): Promise<LLMEvaluatorResponseDTO> {
  const [model, inputs] = await Promise.all([
    e.modelId ? ModelRepository.findById(ctx.db, e.modelId) : null,
    LLMEvaluatorRepository.findInputsByEvaluatorId(ctx.db, e.id as string),
  ]);
  return fromLLMEvaluator(e, model, inputs);
}

export async function toResponseDTOs(ctx: Ctx, es: LLMEvaluator[]): Promise<LLMEvaluatorResponseDTO[]> {
  const ids = es.map((e) => e.id as string);
  const modelIds = [...new Set(es.map((e) => e.modelId).filter((x): x is string => !!x))];
  const [models, inputs] = await Promise.all([
    ModelRepository.findAllById(ctx.db, modelIds),
    LLMEvaluatorRepository.findInputsByEvaluatorIds(ctx.db, ids),
  ]);
  const byId = new Map(models.map((m) => [m.id, m]));
  return es.map((e) => fromLLMEvaluator(e, (e.modelId && byId.get(e.modelId)) || null, inputs.get(e.id as string) ?? []));
}

async function saveWithInputs(ctx: Ctx, e: LLMEvaluator, inputs: ModelInput[] | null): Promise<LLMEvaluator> {
  const stmts = [LLMEvaluatorRepository.saveStmt(ctx.db, e)];
  if (inputs) stmts.push(...LLMEvaluatorRepository.saveInputsStmts(ctx.db, e.id as string, inputs));
  await ctx.db.batch(stmts);
  return e;
}

async function getAndValidateModel(ctx: Ctx, modelId: string, user: UserRef): Promise<Model> {
  const model = await ModelService.getModelForUser(ctx, user, modelId);
  if (model.isDeprecated) throw new NotFoundException("Model is deprecated");
  return model;
}

async function validateEvaluatorNameUniqueness(ctx: Ctx, name: string, user: UserRef): Promise<void> {
  if (await checkIfLLMEvaluatorNameExists(ctx, name, user)) throw new EvaluatorNameExistException(SCRORE_NAME_ALREADY_EXIST);
}

export async function createLLMEvaluator(ctx: Ctx, request: LLMEvaluatorRequestDTO, user: UserRef): Promise<LLMEvaluatorResponseDTO> {
  const model = await getAndValidateModel(ctx, request.model_id as string, user);
  await validateEvaluatorNameUniqueness(ctx, request.name as string, user);
  const evaluator = create({
    type: ScopeType.USER,
    description: request.description ?? null,
    name: request.name ?? null,
    userId: user.id,
    outputCategories: outputCategoriesJson(request.output_categories),
    outputFormatType: request.output_format_type ?? null,
    modelId: model.id,
    variables: variablesJson(request.variables),
  });
  const inputs = createModelInputsFromPrompts(request.prompts ?? [], user);
  await saveWithInputs(ctx, evaluator, inputs);
  return fromLLMEvaluator(evaluator, model, inputs);
}

export async function checkIfLLMEvaluatorNameExists(ctx: Ctx, name: string, user: UserRef): Promise<boolean> {
  return LLMEvaluatorRepository.checkIfLLMEvaluatorNameExists(ctx.db, name, user.id as string, ScopeType.SYSTEM);
}

export async function getAllLLMScorer(ctx: Ctx, user: UserRef): Promise<LLMEvaluator[]> {
  return LLMEvaluatorRepository.findAllByUserOrType(ctx.db, user.id, ScopeType.SYSTEM);
}

export async function getById(ctx: Ctx, user: UserRef, id: string): Promise<LLMEvaluator> {
  const e = await LLMEvaluatorRepository.findSystemEvaluatorByIdOrUserEvaluatorByIdAndUser(ctx.db, id, user.id as string);
  if (!e) throw new NotFoundException(`evaluator: ${id} does not exists`);
  return e;
}

export async function getEvaluatorById(ctx: Ctx, user: UserRef, evaluatorId: string): Promise<LLMEvaluatorResponseDTO> {
  return toResponseDTO(ctx, await getById(ctx, user, evaluatorId));
}

export async function getByName(ctx: Ctx, user: UserRef, name: string): Promise<LLMEvaluator> {
  const e = await LLMEvaluatorRepository.findByNameAndUserOrType(ctx.db, name, user.id as string, ScopeType.SYSTEM);
  if (!e) throw new NotFoundException(`evaluator: ${name} does not exists`);
  return e;
}

export async function updateLLMEvaluator(
  ctx: Ctx,
  request: LLMEvaluatorUpdateDTO,
  evaluatorId: string,
  user: UserRef,
): Promise<LLMEvaluatorResponseDTO> {
  const e = await LLMEvaluatorRepository.findSystemEvaluatorByIdOrUserEvaluatorByIdAndUser(ctx.db, evaluatorId, user.id as string);
  if (!e) throw new NotFoundException(`Evaluator: ${evaluatorId} does not exists`);
  if (e.type === ScopeType.SYSTEM) throw new IllegalInputException("System Evaluator cannot be updated");

  if (request.name != null && e.name !== request.name) {
    await validateEvaluatorNameUniqueness(ctx, request.name, user);
    e.name = request.name;
  }
  if (request.description != null) e.description = request.description;
  if (request.output_format_type != null) e.outputFormatType = request.output_format_type;
  if (request.output_categories != null) e.outputCategories = outputCategoriesJson(request.output_categories);
  if (request.variables != null) e.variables = variablesJson(request.variables);
  if (request.model_id != null) e.modelId = (await getAndValidateModel(ctx, request.model_id, user)).id;
  const inputs = request.prompts != null ? createModelInputsFromPrompts(request.prompts, user) : null;
  await saveWithInputs(ctx, e, inputs);
  return toResponseDTO(ctx, e);
}

export async function getEvaluatorByUserOrSystemType(ctx: Ctx, user: UserRef): Promise<LLMEvaluatorResponseDTO[]> {
  return toResponseDTOs(ctx, await LLMEvaluatorRepository.findAllByUserOrType(ctx.db, user.id, ScopeType.SYSTEM));
}

export async function getEvaluatorBySystemType(ctx: Ctx): Promise<LLMEvaluatorResponseDTO[]> {
  return toResponseDTOs(ctx, await LLMEvaluatorRepository.findAllNonDeprecatedByType(ctx.db, ScopeType.SYSTEM));
}

export async function getEvaluatorByUser(ctx: Ctx, user: UserRef): Promise<LLMEvaluatorResponseDTO[]> {
  return toResponseDTOs(ctx, await LLMEvaluatorRepository.findAllNonDeprecatedByUser(ctx.db, user.id as string));
}

/** Evaluators already used in an evaluation are deprecated, the others deleted. */
export async function removeLLMEvaluatorById(ctx: Ctx, user: UserRef, evaluatorId: string): Promise<void> {
  const e = await LLMEvaluatorRepository.findByIdAndUser(ctx.db, evaluatorId, user.id as string);
  if (!e) throw new NotFoundException("Evaluator not found for user");
  if (await EvaluationStatusRepository.existsByEvaluatorId(ctx.db, evaluatorId)) {
    e.deprecated = true;
    await LLMEvaluatorRepository.save(ctx.db, e);
  } else {
    await LLMEvaluatorRepository.delete(ctx.db, e);
  }
}
