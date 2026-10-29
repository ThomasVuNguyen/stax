/**
 * Port of domain/evaluator/pairwise/service/PairwiseLLMEvaluatorService(+Impl).
 * `user` arguments only need an `id`. Response helpers: `toResponseDTO`, `toResponseDTOs`;
 * `loadModelsAndInputs` is shared with the generic evaluator listing.
 */
import type { Ctx } from "../../../../lib/ctx";
import { EvaluatorNameExistException, IllegalInputException, NotFoundException } from "../../../../lib/errors";
import type { Model } from "../../../../entities/Model";
import type { ModelInput } from "../../../../entities/ModelInput";
import { type PairwiseLLMEvaluator, create } from "../../../../entities/PairwiseLLMEvaluator";
import { ScopeType } from "../../../../enums/ScopeType";
import { SCRORE_NAME_ALREADY_EXIST } from "../../../../util/CustomScorerStringConstant";
import * as PairwiseScoreRepository from "../../../evaluation/PairwiseScoreRepository";
import * as ModelRepository from "../../../model/ModelRepository";
import * as ModelService from "../../../model/service/ModelService";
import {
  createModelInputsFromPrompts,
  outputCategoriesJson,
  variablesJson,
} from "../../llm/service/NewLLMEvaluatorService";
import * as PairwiseLLMEvaluatorRepository from "../PairwiseLLMEvaluatorRepository";
import type { PairwiseLLMEvaluatorRequestDTO } from "../dto/PairwiseLLMEvaluatorRequestDTO";
import {
  type PairwiseLLMEvaluatorResponseDTO,
  fromPairwiseLLMEvaluator,
} from "../dto/PairwiseLLMEvaluatorResponseDTO";

type UserRef = { id: string | null };

export async function loadModelsAndInputs(
  ctx: Ctx,
  es: PairwiseLLMEvaluator[],
): Promise<{ models: Map<string | null, Model>; inputs: Map<string, ModelInput[]> }> {
  const modelIds = [...new Set(es.map((e) => e.modelId).filter((x): x is string => !!x))];
  const [models, inputs] = await Promise.all([
    ModelRepository.findAllById(ctx.db, modelIds),
    PairwiseLLMEvaluatorRepository.findInputsByEvaluatorIds(ctx.db, es.map((e) => e.id as string)),
  ]);
  return { models: new Map(models.map((m) => [m.id, m])), inputs };
}

export async function toResponseDTOs(ctx: Ctx, es: PairwiseLLMEvaluator[]): Promise<PairwiseLLMEvaluatorResponseDTO[]> {
  const { models, inputs } = await loadModelsAndInputs(ctx, es);
  return es.map((e) => fromPairwiseLLMEvaluator(e, models.get(e.modelId) ?? null, inputs.get(e.id as string) ?? []));
}

export async function toResponseDTO(ctx: Ctx, e: PairwiseLLMEvaluator): Promise<PairwiseLLMEvaluatorResponseDTO> {
  return (await toResponseDTOs(ctx, [e]))[0];
}

async function validateAndGetModel(ctx: Ctx, user: UserRef, modelId: string): Promise<Model> {
  const model = await ModelService.getModelForUser(ctx, user, modelId);
  if (model.isDeprecated) throw new NotFoundException("Model is deprecated");
  return model;
}

async function validateEvaluatorNameUniqueness(ctx: Ctx, name: string, user: UserRef): Promise<void> {
  const exists = await PairwiseLLMEvaluatorRepository.checkIfPairwiseLLMEvaluatorNameExists(
    ctx.db,
    name,
    user.id as string,
    ScopeType.SYSTEM,
  );
  if (exists) throw new EvaluatorNameExistException(SCRORE_NAME_ALREADY_EXIST);
}

function validateSystemEvaluator(e: PairwiseLLMEvaluator): void {
  if (e.type === ScopeType.SYSTEM) throw new IllegalInputException("System Pairwise Evaluator cannot be updated/removed");
}

async function getAndValidateExistingEvaluator(ctx: Ctx, evaluatorId: string, user: UserRef): Promise<PairwiseLLMEvaluator> {
  const e = await PairwiseLLMEvaluatorRepository.findById(ctx.db, evaluatorId);
  if (!e || (e.type !== ScopeType.SYSTEM && (e.userId == null || e.userId !== user.id))) {
    throw new NotFoundException(`Pairwise evaluator: ${evaluatorId} does not exists`);
  }
  return e;
}

async function saveWithInputs(ctx: Ctx, e: PairwiseLLMEvaluator, inputs: ModelInput[] | null): Promise<void> {
  const stmts = [PairwiseLLMEvaluatorRepository.saveStmt(ctx.db, e)];
  if (inputs) stmts.push(...PairwiseLLMEvaluatorRepository.saveInputsStmts(ctx.db, e.id as string, inputs));
  await ctx.db.batch(stmts);
}

export async function createPairwiseLLMEvaluator(
  ctx: Ctx,
  request: PairwiseLLMEvaluatorRequestDTO,
  user: UserRef,
): Promise<PairwiseLLMEvaluatorResponseDTO> {
  const model = await validateAndGetModel(ctx, user, request.model_id as string);
  await validateEvaluatorNameUniqueness(ctx, request.name as string, user);
  const e = create({
    type: ScopeType.USER,
    name: request.name ?? null,
    description: request.description ?? null,
    userId: user.id,
    modelId: model.id,
    outputCategories: outputCategoriesJson(request.output_categories),
    outputFormatType: request.output_format_type ?? null,
    variables: variablesJson(request.variables),
  });
  const inputs = createModelInputsFromPrompts(request.prompts ?? [], user);
  await saveWithInputs(ctx, e, inputs);
  return fromPairwiseLLMEvaluator(e, model, inputs);
}

export async function getAllPairwiseLLMEvaluators(ctx: Ctx, user: UserRef): Promise<PairwiseLLMEvaluator[]> {
  return PairwiseLLMEvaluatorRepository.findAllByUserOrType(ctx.db, user.id, ScopeType.SYSTEM);
}

export async function getEvaluatorById(ctx: Ctx, user: UserRef, evaluatorId: string): Promise<PairwiseLLMEvaluatorResponseDTO> {
  return toResponseDTO(ctx, await getAndValidateExistingEvaluator(ctx, evaluatorId, user));
}

export async function getEvaluatorByUserOrSystemType(ctx: Ctx, user: UserRef): Promise<PairwiseLLMEvaluatorResponseDTO[]> {
  return toResponseDTOs(ctx, await getAllPairwiseLLMEvaluators(ctx, user));
}

/** Evaluators with scores of this user are deprecated, the others deleted. */
export async function removePairwiseLLMEvaluatorById(ctx: Ctx, user: UserRef, evaluatorId: string): Promise<void> {
  const e = await getAndValidateExistingEvaluator(ctx, evaluatorId, user);
  validateSystemEvaluator(e);
  if (await PairwiseScoreRepository.existsByEvaluatorId(ctx.db, e.id as string, user.id as string)) {
    e.deprecated = true;
    await PairwiseLLMEvaluatorRepository.save(ctx.db, e);
  } else {
    await PairwiseLLMEvaluatorRepository.delete(ctx.db, e);
  }
}

export async function updatePairwiseLLMEvaluator(
  ctx: Ctx,
  user: UserRef,
  evaluatorId: string,
  request: PairwiseLLMEvaluatorRequestDTO,
): Promise<PairwiseLLMEvaluatorResponseDTO> {
  const e = await getAndValidateExistingEvaluator(ctx, evaluatorId, user);
  validateSystemEvaluator(e);
  if (request.name != null && e.name !== request.name) {
    await validateEvaluatorNameUniqueness(ctx, request.name, user);
    e.name = request.name;
  }
  if (request.description != null) e.description = request.description;
  if (request.model_id) e.modelId = (await validateAndGetModel(ctx, user, request.model_id)).id;
  if (request.variables?.length) e.variables = variablesJson(request.variables);
  if (request.output_categories?.length) e.outputCategories = outputCategoriesJson(request.output_categories);
  if (request.output_format_type != null) e.outputFormatType = request.output_format_type;
  const inputs = request.prompts?.length ? createModelInputsFromPrompts(request.prompts, user) : null;
  await saveWithInputs(ctx, e, inputs);
  return toResponseDTO(ctx, e);
}
