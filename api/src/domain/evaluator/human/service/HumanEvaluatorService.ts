/**
 * Port of domain/evaluator/human/service/HumanEvaluatorService(+Impl).
 *
 * Overloads: `getEvaluators(ctx, user)` returns the user's and the SYSTEM evaluators;
 * `getEvaluators(ctx, user, scopeType, scoringMechanismType)` (any 4-argument call, nulls allowed)
 * filters the user's evaluators — also exported as `getEvaluatorsFiltered`.
 * `createChatTurnFeedback` takes the ModelResponse (only its id is used).
 */
import type { Ctx } from "../../../../lib/ctx";
import { IllegalInputException, NotFoundException } from "../../../../lib/errors";
import * as HumanEvalScoreEntity from "../../../../entities/HumanEvalScore";
import type { HumanEvalScore } from "../../../../entities/HumanEvalScore";
import { type HumanEvaluator, create } from "../../../../entities/HumanEvaluator";
import { LinkedEntityType } from "../../../../enums/LinkedEntityType";
import { ScopeType } from "../../../../enums/ScopeType";
import { ScoringMechanismType } from "../../../../enums/ScoringMechanismType";
import * as HumanEvalScoreRepository from "../../../evaluation/HumanEvalScoreRepository";
import * as ScoreV2Repository from "../../../evaluation/ScoreV2Repository";
import * as HumanEvaluatorRepository from "../HumanEvaluatorRepository";
import { type HumanCategoryOption, normalize as normalizeCategory } from "../dto/HumanCategoryOption";
import { type HumanRangeOption, normalize as normalizeRange } from "../dto/HumanRangeOption";
import type { ScoreV2DTO } from "../dto/ScoreV2DTO";

type UserRef = { id: string | null };

export async function createEvaluator(
  ctx: Ctx,
  user: UserRef,
  name: string | null,
  description: string | null,
  scoringMechanismType: ScoringMechanismType | null,
  _associatedEntityId: string | null,
  _entityType: string | null,
  categories: HumanCategoryOption[] | null,
  linkedEntityType: LinkedEntityType | null,
): Promise<HumanEvaluator> {
  if (scoringMechanismType == null) throw new IllegalInputException("Scoring mechanism type is required");
  const e = create({
    name,
    description,
    scoringMechanismType,
    userId: user.id,
    scopeType: ScopeType.USER,
    linkedEntityType,
  });
  if (scoringMechanismType === ScoringMechanismType.CATEGORY) {
    if (!categories || !categories.length) {
      throw new IllegalInputException("Categories are required for CATEGORY type evaluator");
    }
    e.categories = JSON.stringify(categories.map(normalizeCategory));
  }
  // RANGE: range options were never wired in the Java implementation (TODO upstream).
  return HumanEvaluatorRepository.save(ctx.db, e);
}

/** Returns the user's MODEL_RESPONSE evaluator, creating the "Thumbs Up/Down" one if missing. */
export async function createUserThumbsEvaluator(ctx: Ctx, user: UserRef): Promise<HumanEvaluator> {
  const existing = await HumanEvaluatorRepository.findByUserAndLinkedEntityType(ctx.db, user.id, LinkedEntityType.MODEL_RESPONSE);
  if (existing.length) return existing[0];
  const categories: HumanCategoryOption[] = [
    { categoryName: "Thumbs Up", score: 1.0, description: "Positive feedback", id: "thumbs-up" },
    { categoryName: "Neutral", score: 0.0, description: "Neutral feedback", id: "neutral" },
    { categoryName: "Thumbs Down", score: -1.0, description: "Negative feedback", id: "thumbs-down" },
  ];
  return HumanEvaluatorRepository.save(
    ctx.db,
    create({
      name: "Thumbs Up/Down",
      description: "User feedback for chat turns",
      scoringMechanismType: ScoringMechanismType.CATEGORY,
      scopeType: ScopeType.USER,
      linkedEntityType: LinkedEntityType.MODEL_RESPONSE,
      userId: user.id,
      categories: JSON.stringify(categories),
    }),
  );
}

/** Creates or updates the user's score for (model response, evaluator). */
export async function createChatTurnFeedback(
  ctx: Ctx,
  modelResponse: { id: string | null },
  evaluator: HumanEvaluator,
  user: UserRef,
  score: number | null,
  notes: string | null,
): Promise<HumanEvalScore> {
  const existing = await HumanEvalScoreRepository.findByModelResponseIdAndEvaluatorId(
    ctx.db,
    modelResponse.id as string,
    evaluator.id as string,
    user.id as string,
  );
  const s = existing ?? HumanEvalScoreEntity.create({ modelResponseId: modelResponse.id, userId: user.id });
  HumanEvalScoreEntity.setScore(s, score, evaluator);
  s.notes = notes;
  return HumanEvalScoreRepository.save(ctx.db, s);
}

export async function deleteHumanEvalScoreById(ctx: Ctx, humanEvalScoreId: string, user: UserRef): Promise<void> {
  const score = await HumanEvalScoreRepository.findById(ctx.db, humanEvalScoreId);
  if (!score) throw new NotFoundException("HumanEvalScore not found");
  if (score.userId !== user.id) throw new NotFoundException("Human score does not belong to the user");
  await HumanEvalScoreRepository.deleteById(ctx.db, humanEvalScoreId);
}

export async function getEvaluatorsByEntityId(ctx: Ctx, entityId: string): Promise<HumanEvaluator[]> {
  return HumanEvaluatorRepository.findByAssociatedEntityId(ctx.db, entityId);
}

export async function getEvaluatorsByEntityType(ctx: Ctx, entityType: LinkedEntityType): Promise<HumanEvaluator[]> {
  return HumanEvaluatorRepository.findByLinkedEntityType(ctx.db, entityType);
}

export async function getUserEvaluators(ctx: Ctx, user: UserRef): Promise<HumanEvaluator[]> {
  return HumanEvaluatorRepository.findByUser(ctx.db, user.id);
}

export async function getEvaluatorsFiltered(
  ctx: Ctx,
  user: UserRef,
  scopeType: ScopeType | null | undefined,
  scoringMechanismType: ScoringMechanismType | null | undefined,
): Promise<HumanEvaluator[]> {
  let evaluators = await HumanEvaluatorRepository.findByUser(ctx.db, user.id);
  if (scopeType != null) evaluators = evaluators.filter((e) => e.scopeType === scopeType);
  if (scoringMechanismType != null) evaluators = evaluators.filter((e) => e.scoringMechanismType === scoringMechanismType);
  return evaluators;
}

export function getEvaluators(ctx: Ctx, user: UserRef): Promise<HumanEvaluator[]>;
export function getEvaluators(
  ctx: Ctx,
  user: UserRef,
  scopeType: ScopeType | null | undefined,
  scoringMechanismType: ScoringMechanismType | null | undefined,
): Promise<HumanEvaluator[]>;
export function getEvaluators(ctx: Ctx, user: UserRef, ...filters: unknown[]): Promise<HumanEvaluator[]> {
  if (filters.length === 0) return HumanEvaluatorRepository.findByUserOrScopeType(ctx.db, user.id, ScopeType.SYSTEM);
  return getEvaluatorsFiltered(ctx, user, filters[0] as ScopeType | null, filters[1] as ScoringMechanismType | null);
}

/**
 * Java looked up scores by model response id using the *chat turn* id and mapped each score to
 * null (unfinished converter); the response is therefore a list of nulls, reproduced as is.
 */
export async function getChatTurnFeedbacks(ctx: Ctx, chatTurnId: string): Promise<(ScoreV2DTO | null)[]> {
  return (await ScoreV2Repository.findByModelResponse_Id(ctx.db, chatTurnId)).map(() => null);
}

export async function findByIdAndUser(ctx: Ctx, id: string, user: UserRef): Promise<HumanEvaluator> {
  const e = await HumanEvaluatorRepository.findByIdAndUser(ctx.db, id, user.id);
  if (!e) throw new NotFoundException("Evaluator not found");
  return e;
}

export async function updateEvaluator(
  ctx: Ctx,
  id: string,
  user: UserRef,
  name: string | null | undefined,
  description: string | null | undefined,
  comments: string | null | undefined,
  scoringMechanismType: ScoringMechanismType | null | undefined,
  linkedEntityType: LinkedEntityType | null | undefined,
): Promise<HumanEvaluator> {
  const e = await findByIdAndUser(ctx, id, user);
  if (e.scopeType === ScopeType.SYSTEM) throw new IllegalInputException("Cannot update system evaluator");
  if (name != null) e.name = name;
  if (description != null) e.description = description;
  if (scoringMechanismType != null) e.scoringMechanismType = scoringMechanismType;
  if (comments != null) e.comments = comments;
  if (linkedEntityType != null) e.linkedEntityType = linkedEntityType;
  return HumanEvaluatorRepository.save(ctx.db, e);
}

export async function deprecateEvaluator(ctx: Ctx, evaluatorId: string, user: UserRef): Promise<HumanEvaluator> {
  const e = await findByIdAndUser(ctx, evaluatorId, user);
  if (e.scopeType === ScopeType.SYSTEM) throw new IllegalInputException("System evaluators cannot be deprecated");
  e.deprecated = true;
  return HumanEvaluatorRepository.save(ctx.db, e);
}

/** linkedEntityType stays null (as in Java), which the NOT NULL column rejects. */
export async function createRangeEvaluator(
  ctx: Ctx,
  name: string,
  description: string,
  rangeOption: HumanRangeOption | null,
  user: UserRef,
): Promise<HumanEvaluator> {
  return HumanEvaluatorRepository.save(
    ctx.db,
    create({
      name,
      description,
      scoringMechanismType: ScoringMechanismType.RANGE,
      scopeType: ScopeType.USER,
      userId: user.id,
      rangeOptions: JSON.stringify(normalizeRange(rangeOption)),
    }),
  );
}

export async function getEvaluator(ctx: Ctx, id: string, user: UserRef): Promise<HumanEvaluator> {
  const e = await HumanEvaluatorRepository.findByIdAndUser(ctx.db, id, user.id);
  if (!e) throw new IllegalInputException("Evaluator not found");
  return e;
}

export async function deleteEvaluator(ctx: Ctx, id: string, user: UserRef): Promise<void> {
  const e = await getEvaluator(ctx, id, user);
  if (e.scopeType === ScopeType.SYSTEM) throw new IllegalInputException("Cannot delete system evaluator");
  await HumanEvaluatorRepository.delete(ctx.db, e);
}

export async function deleteAllByUser(ctx: Ctx, user: UserRef): Promise<void> {
  await HumanEvaluatorRepository.deleteAllByUser(ctx.db, user.id);
}
