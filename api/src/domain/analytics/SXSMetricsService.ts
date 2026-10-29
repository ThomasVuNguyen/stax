/**
 * Port of analytics/SXSMetricsService + SXSMetricsServiceImpl (used by project/SXSController).
 * SXSHumanFeedbackService.getHumanEvalMetricsByProject and
 * PairwiseLLMEvaluatorService.getAllPairwiseLLMEvaluators only delegated to their repositories, so
 * the repositories are called directly. Map-valued results keep first-seen order (Java HashMaps).
 */
import type { Ctx } from "../../lib/ctx";
import { NotFoundException } from "../../lib/errors";
import { EvaluationType } from "../../enums/EvaluationType";
import type { HumanSxsRating } from "../../enums/HumanSxsRating";
import { ScopeType } from "../../enums/ScopeType";
import type { Project } from "../../entities/Project";
import { convertJsonStringToList } from "../../util/ObjectMapperUtil";
import * as PairwiseScoreRepository from "../evaluation/PairwiseScoreRepository";
import * as SXSHumanFeedbackRepository from "../evaluation/SXSHumanFeedbackRepository";
import * as PairwiseLLMEvaluatorRepository from "../evaluator/pairwise/PairwiseLLMEvaluatorRepository";
import * as InferenceMonitoringRepository from "../inferencemonitoring/InferenceMonitoringRepository";
import * as ProjectRepository from "../project/ProjectRepository";
import type { SXSEvaluationAnalyticsDTO } from "../project/dto/SXSEvaluationAnalyticsDTO";
import type { SXSHumanEvalMetricsDTO } from "../project/dto/SXSHumanEvalMetricsDTO";
import type { SXSPairwiseEvaluationMetricsDTO } from "../project/dto/SXSPairwiseEvaluationMetricsDTO";
import type { SXSProjectInferenceMonitoringSummaryDTO } from "../project/dto/SXSProjectInferenceMonitoringSummaryDTO";
import * as ProjectEvaluationAnalyticsByScorer from "./evaluation/dto/ProjectEvaluationAnalyticsByScorer";
import type { UserEvalChartEntryDTO } from "./evaluation/dto/UserEvalChartEntryDTO";
import * as UserEvalMonitoringParams from "./evaluation/dto/UserEvalMonitoringParams";
import * as UserEvalMonitoringService from "./evaluation/UserEvalMonitoringService";
import type { ProjectInferenceMonitoringSummaryDTO } from "./inference/dto/ProjectInferenceMonitoringSummaryDTO";

type UserRef = { id: string | null };
type ByScorer = ProjectEvaluationAnalyticsByScorer.ProjectEvaluationAnalyticsByScorer;

export async function getHumanEvalMetrics(ctx: Ctx, projectId: string, user: UserRef): Promise<SXSHumanEvalMetricsDTO> {
  const project = await getProject(ctx, projectId, user);
  const ratingCounts = await SXSHumanFeedbackRepository.getHumanEvalMetricsByProject(ctx.db, project.id!, user.id!);
  const ratingCountsMap: Partial<Record<HumanSxsRating, number>> = {};
  for (const rc of ratingCounts) ratingCountsMap[rc.rating] = rc.count;
  const total = ratingCounts.reduce((n, rc) => n + rc.count, 0);
  return { ratingCounts: ratingCountsMap, total };
}

export async function getInferenceMetrics(
  ctx: Ctx,
  projectId: string,
  user: UserRef,
): Promise<SXSProjectInferenceMonitoringSummaryDTO> {
  const project = await getProject(ctx, projectId, user);
  const [sideA, sideB] = await Promise.all([
    InferenceMonitoringRepository.getSxSSideAInferenceMonitoringSummary(ctx.db, project.id!, user.id!),
    InferenceMonitoringRepository.getSxSSideBInferenceMonitoringSummary(ctx.db, project.id!, user.id!),
  ]);
  return { sideA, sideB, delta: calculateInferenceDelta(sideA, sideB) };
}

export async function getEvaluationAnalyticsByScorer(
  ctx: Ctx,
  projectId: string,
  scorerId: string,
  user: UserRef,
): Promise<SXSEvaluationAnalyticsDTO> {
  const project = await getProject(ctx, projectId, user);
  const sideA = await getAnalyticsForScorer(ctx, project, scorerId, user, "chatTurnA");
  const sideB = await getAnalyticsForScorer(ctx, project, scorerId, user, "chatTurnB");
  return {
    side_a: sideA,
    side_b: sideB,
    delta: calculateAverageScoreDelta(sideA, sideB),
    scorer_id: scorerId,
    scorer_name: sideA.scorer_name != null ? sideA.scorer_name : sideB.scorer_name,
  };
}

export async function getEvaluationAnalyticsForAllScorers(
  ctx: Ctx,
  projectId: string,
  user: UserRef,
): Promise<SXSEvaluationAnalyticsDTO[]> {
  const project = await getProject(ctx, projectId, user);
  const params = UserEvalMonitoringParams.create({ projectId: project.id, sxsJoinColumnName: "chatTurnA" });
  const allSideAAnalytics = await UserEvalMonitoringService.getAnalyticsMonitoringData(ctx, user, params);
  params.sxsJoinColumnName = "chatTurnB";
  const allSideBAnalytics = await UserEvalMonitoringService.getAnalyticsMonitoringData(ctx, user, params);
  if (Object.keys(allSideAAnalytics).length === 0 && Object.keys(allSideBAnalytics).length === 0) return [];
  return getEvaluationMetricsResult(allSideAAnalytics, allSideBAnalytics);
}

function getEvaluationMetricsResult(
  allSideAAnalytics: Record<string, UserEvalChartEntryDTO>,
  allSideBAnalytics: Record<string, UserEvalChartEntryDTO>,
): SXSEvaluationAnalyticsDTO[] {
  const result: SXSEvaluationAnalyticsDTO[] = [];
  const remainingB = new Map(Object.entries(allSideBAnalytics));
  const fromEntry = (e: UserEvalChartEntryDTO) =>
    ProjectEvaluationAnalyticsByScorer.fromDatapoints(e.datapoints, e.scorerId, e.scorerName);

  for (const [scorerName, sideAChartEntry] of Object.entries(allSideAAnalytics)) {
    const sideBChartEntry = remainingB.get(scorerName);
    const sideA = fromEntry(sideAChartEntry);
    const sideB = sideBChartEntry ? fromEntry(sideBChartEntry) : null;
    result.push({
      side_a: sideA,
      side_b: sideB,
      delta: calculateAverageScoreDelta(sideA, sideB),
      scorer_id: sideAChartEntry.scorerId,
      scorer_name: scorerName,
    });
    remainingB.delete(scorerName);
  }
  for (const sideBChartEntry of remainingB.values()) {
    const sideB = fromEntry(sideBChartEntry);
    result.push({
      side_a: null,
      side_b: sideB,
      delta: calculateAverageScoreDelta(null, sideB),
      scorer_id: sideBChartEntry.scorerId,
      scorer_name: sideBChartEntry.scorerName,
    });
  }
  return result;
}

async function getProject(ctx: Ctx, projectId: string, user: UserRef): Promise<Project> {
  const project = await ProjectRepository.findByUserAndId(ctx.db, user.id!, projectId);
  if (!project) throw new NotFoundException("Project not found for this user");
  if (project.evaluationType !== EvaluationType.SXS) throw new NotFoundException("Project is not an SxS project");
  return project;
}

async function getAnalyticsForScorer(
  ctx: Ctx,
  project: Project,
  scorerId: string,
  user: UserRef,
  sxsJoinColumn: string,
): Promise<ByScorer> {
  const params = UserEvalMonitoringParams.create({
    sxsJoinColumnName: sxsJoinColumn,
    projectId: project.id,
    scorerIds: [scorerId],
  });
  const analytics = await UserEvalMonitoringService.getAnalyticsMonitoringData(ctx, user, params);
  const entry = Object.values(analytics)[0];
  if (!entry) return ProjectEvaluationAnalyticsByScorer.create();
  return ProjectEvaluationAnalyticsByScorer.fromDatapoints(entry.datapoints, entry.scorerId, entry.scorerName);
}

function calculateInferenceDelta(
  sideA: ProjectInferenceMonitoringSummaryDTO,
  sideB: ProjectInferenceMonitoringSummaryDTO,
): ProjectInferenceMonitoringSummaryDTO {
  return {
    total_inferences: sideA.total_inferences - sideB.total_inferences,
    average_turn_time_taken: calculateDelta(sideA.average_turn_time_taken, sideB.average_turn_time_taken),
    total_prompt_tokens: sideA.total_prompt_tokens - sideB.total_prompt_tokens,
    total_completion_tokens: sideA.total_completion_tokens - sideB.total_completion_tokens,
    total_tokens: sideA.total_tokens - sideB.total_tokens,
  };
}

function calculateAverageScoreDelta(sideA: ByScorer | null, sideB: ByScorer | null): number {
  if (sideA == null || sideB == null) return 0.0;
  return calculateDelta(sideA.average_score, sideB.average_score);
}

function calculateDelta(sideA: number | null, sideB: number | null): number {
  if (sideA == null && sideB == null) return 0.0;
  if (sideA == null) return -sideB!;
  if (sideB == null) return sideA;
  return sideA - sideB;
}

export async function getSxsEvalMetrics(
  ctx: Ctx,
  containerId: string,
  user: UserRef,
): Promise<SXSPairwiseEvaluationMetricsDTO[]> {
  const records = await PairwiseScoreRepository.getPairwiseEvaluationRecords(ctx.db, containerId, user.id!);
  const evaluators = await PairwiseLLMEvaluatorRepository.findAllByUserOrType(ctx.db, user.id, ScopeType.SYSTEM);
  const evaluatorMap = new Map(evaluators.map((e) => [e.id!, e]));

  const metricsMap = new Map<string, SXSPairwiseEvaluationMetricsDTO>();
  for (const record of records) {
    let metrics = metricsMap.get(record.scorerId);
    if (!metrics) {
      const evaluator = evaluatorMap.get(record.scorerId);
      if (!evaluator) continue;
      const categories =
        convertJsonStringToList<{ name?: string | null; color?: string | null }>(evaluator.outputCategories) ?? [];
      metrics = {
        scorer_id: evaluator.id,
        scorer_name: evaluator.name,
        datapoints: categories.map((category) => ({
          category: category.name ?? null,
          score: category.name ?? null,
          count: 0,
          color: category.color ?? null,
        })),
      };
      metricsMap.set(record.scorerId, metrics);
    }
    // SXSPairwiseEvaluationMetricsDTO.updateCount(score, count)
    const dp = metrics.datapoints.find((d) => d.score === record.score);
    if (dp) dp.count = Number(record.count);
  }
  return [...metricsMap.values()];
}
