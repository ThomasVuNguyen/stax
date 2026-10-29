/**
 * Port of domain/evaluator/heuristic/service/PointwiseHeuristicEvaluatorService(+Impl).
 * EntityNotFoundException (no dedicated handler) is rendered as 500 RUNTIME_ERROR.
 */
import type { Ctx } from "../../../../lib/ctx";
import { EvaluatorNameExistException, NotFoundException, RuntimeException } from "../../../../lib/errors";
import { type PointwiseHeuristicEvaluator, create } from "../../../../entities/PointwiseHeuristicEvaluator";
import { CriteriaType } from "../../../../enums/CriteriaType";
import { SCRORE_NAME_ALREADY_EXIST } from "../../../../util/CustomScorerStringConstant";
import * as EvaluationStatusRepository from "../../../evaluationstatus/EvaluationStatusRepository";
import type { PointwiseHeuristicEvaluatorUpdateDTO } from "../../dto/PointwiseHeuristicEvaluatorUpdateDTO";
import * as PointwiseHeuristicEvaluatorRepository from "../PointwiseHeuristicEvaluatorRepository";
import { type PointwiseHeuristicEvaluatorRequestDTO, getCriteriaType } from "../dto/PointwiseHeuristicEvaluatorRequestDTO";
import {
  type PointwiseHeuristicEvaluatorResponseDTO,
  fromPointwiseHeuristicEvaluator,
} from "../dto/PointwiseHeuristicEvaluatorResponseDTO";

type UserRef = { id: string | null };

export const DEFAULT_CONTAINS_EVALUATOR_NAME = "Contains Stax";
export const DEFAULT_CONTAINS_EVALUATOR_CRITERIA = "Stax";
export const DEFAULT_REGEX_EVALUATOR_NAME = "Regex Stax";
export const DEFAULT_REGEX_EVALUATOR_CRITERIA = ".*Stax.*";

async function savePointwiseHeuristicEvaluator(
  ctx: Ctx,
  user: UserRef,
  name: string | null,
  criteria: string | null,
  type: CriteriaType | null,
): Promise<PointwiseHeuristicEvaluator> {
  return PointwiseHeuristicEvaluatorRepository.save(ctx.db, create({ name, userId: user.id, criteria, criteriaType: type }));
}

async function validateEvaluatorNameUniqueness(ctx: Ctx, name: string, user: UserRef): Promise<void> {
  if (await PointwiseHeuristicEvaluatorRepository.checkIfPointwiseHeuristicEvaluatorNameExists(ctx.db, name, user.id as string)) {
    throw new EvaluatorNameExistException(SCRORE_NAME_ALREADY_EXIST);
  }
}

async function findOrThrow(ctx: Ctx, id: string): Promise<PointwiseHeuristicEvaluator> {
  const e = await PointwiseHeuristicEvaluatorRepository.findById(ctx.db, id);
  if (!e) throw new RuntimeException(`Evaluator not found with id: ${id}`);
  return e;
}

export async function createEvaluator(
  ctx: Ctx,
  request: PointwiseHeuristicEvaluatorRequestDTO,
  user: UserRef,
): Promise<PointwiseHeuristicEvaluatorResponseDTO> {
  await validateEvaluatorNameUniqueness(ctx, request.name as string, user);
  return fromPointwiseHeuristicEvaluator(
    await savePointwiseHeuristicEvaluator(ctx, user, request.name ?? null, request.criteria ?? null, getCriteriaType(request)),
  );
}

/** No ownership check (as in Java). */
export async function getEvaluatorById(ctx: Ctx, id: string, _user: UserRef): Promise<PointwiseHeuristicEvaluatorResponseDTO> {
  return fromPointwiseHeuristicEvaluator(await findOrThrow(ctx, id));
}

export async function getEvaluatorsByUser(ctx: Ctx, user: UserRef): Promise<PointwiseHeuristicEvaluatorResponseDTO[]> {
  return (await PointwiseHeuristicEvaluatorRepository.findAllNonDeprecatedByUser(ctx.db, user.id as string)).map(
    fromPointwiseHeuristicEvaluator,
  );
}

export async function updateEvaluator(
  ctx: Ctx,
  id: string,
  request: PointwiseHeuristicEvaluatorUpdateDTO,
  user: UserRef,
): Promise<PointwiseHeuristicEvaluatorResponseDTO> {
  const e = await findOrThrow(ctx, id);
  if (request.name != null && e.name !== request.name) {
    await validateEvaluatorNameUniqueness(ctx, request.name, user);
    e.name = request.name;
  }
  return fromPointwiseHeuristicEvaluator(await PointwiseHeuristicEvaluatorRepository.save(ctx.db, e));
}

/** Evaluators already used in an evaluation are deprecated, the others deleted. */
export async function removePointwiseHeuristicEvaluatorById(ctx: Ctx, evaluatorId: string, user: UserRef): Promise<void> {
  const e = await PointwiseHeuristicEvaluatorRepository.findByIdAndUser(ctx.db, evaluatorId, user.id as string);
  if (!e) throw new NotFoundException("Evaluator not found for user");
  if (await EvaluationStatusRepository.existsByEvaluatorId(ctx.db, evaluatorId)) {
    e.deprecated = true;
    await PointwiseHeuristicEvaluatorRepository.save(ctx.db, e);
  } else {
    await PointwiseHeuristicEvaluatorRepository.delete(ctx.db, e);
  }
}

/** Seeds the "Contains Stax" / "Regex Stax" evaluators for a new user. */
export async function createDefaultHeuristicEvaluators(ctx: Ctx, user: UserRef): Promise<void> {
  await savePointwiseHeuristicEvaluator(ctx, user, DEFAULT_CONTAINS_EVALUATOR_NAME, DEFAULT_CONTAINS_EVALUATOR_CRITERIA, CriteriaType.CONTAINS);
  await savePointwiseHeuristicEvaluator(ctx, user, DEFAULT_REGEX_EVALUATOR_NAME, DEFAULT_REGEX_EVALUATOR_CRITERIA, CriteriaType.REGEX);
}
