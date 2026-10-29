/**
 * Port of domain/project/ProjectService(+Impl). Signatures mirror Java (`User user` → any
 * `{ id }`, e.g. `requireUser(ctx)`).
 *
 * Overloads / renames:
 * - `createProject(user, command)` (→ ProjectDTO) keeps the name `createProject(ctx, user, command)`;
 *   `createProject(command, user)` (→ Project entity) is `createProjectEntity(ctx, command, user)`.
 */
import type { Ctx } from "../../lib/ctx";
import type { AuthUser } from "../../lib/auth";
import { NotFoundException, ResourceLimitExceedException } from "../../lib/errors";
import * as ProjectEntity from "../../entities/Project";
import type { Project } from "../../entities/Project";
import type { EvaluationType } from "../../enums/EvaluationType";
import type { ModelProvider } from "../../enums/ModelProvider";
import { DEFAULT_PROJECT_NAME_FORMAT, MAX_PROJECTS_PER_USER, formatDefaultName } from "../../util/PlanckConstants";
import * as ProjectEvaluationAnalyticsByScorer from "../analytics/evaluation/dto/ProjectEvaluationAnalyticsByScorer";
import type { UserEvalChartEntryDTO } from "../analytics/evaluation/dto/UserEvalChartEntryDTO";
import * as UserEvalMonitoringParams from "../analytics/evaluation/dto/UserEvalMonitoringParams";
import * as UserEvalMonitoringService from "../analytics/evaluation/UserEvalMonitoringService";
import type { ProjectInferenceMonitoringSummaryDTO } from "../analytics/inference/dto/ProjectInferenceMonitoringSummaryDTO";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import * as HumanEvalScoreRepository from "../evaluation/HumanEvalScoreRepository";
import * as ScoreV2Repository from "../evaluation/ScoreV2Repository";
import * as LLMEvaluatorRepository from "../evaluator/llm/LLMEvaluatorRepository";
import * as InferenceMonitoringRepository from "../inferencemonitoring/InferenceMonitoringRepository";
import type { JobStatusDTO } from "../job/dto/JobStatusDTO";
import * as JobStatusService from "../job/JobStatusService";
import type { CreateProjectCommand } from "./dto/CreateProjectCommand";
import type { HumanEvalMetricsDTO } from "./dto/HumanEvalMetricsDTO";
import type { LatestEvalScoreDTO } from "./dto/LatestEvalScoreDTO";
import type { ListProjectsResponse } from "./dto/ListProjectsResponse";
import type { UpdateProjectCommand } from "./dto/UpdateProjectCommand";
import * as ProjectDTO from "./dto/ProjectDTO";
import * as ProjectRepository from "./ProjectRepository";
import * as SampleProjectService from "./SampleProjectService";

const ALLOWED_INCLUDE_FIELDS = [
  "modelProviders",
  "inferenceMetrics",
  "humanEvalMetrics",
  "latestEvalScore",
  "jobStatuses",
] as const;
const ALL_FIELDS = "all";

type UserRef = { id: string | null };
const uid = (user: UserRef) => user.id as string;

export async function getAllProjectsSortedByIsDefaultAndUpdatedAt(
  ctx: Ctx,
  user: UserRef,
  pageSize: number,
  pageNumber: number,
  type: EvaluationType | null | undefined,
  include: string | null | undefined,
): Promise<ListProjectsResponse> {
  const pageable = { page: pageNumber, size: pageSize };
  const projects = type
    ? await ProjectRepository.findAllByUserAndEvaluationTypeOrderByIsDefaultDescUpdatedAtDesc(ctx.db, uid(user), type, pageable)
    : await ProjectRepository.findAllByUserOrderByIsDefaultDescUpdatedAtDesc(ctx.db, uid(user), pageable);
  return { projects: await enrichProjectsWithFields(ctx, projects, parseIncludeFields(include)) };
}

export async function createProjectEntity(ctx: Ctx, command: CreateProjectCommand, user: UserRef): Promise<Project> {
  const userId = uid(user);
  const projectCount = await ProjectRepository.countByUser(ctx.db, userId);
  if (projectCount >= MAX_PROJECTS_PER_USER) {
    throw new ResourceLimitExceedException("User has reached the project limit.");
  }
  const projectName =
    command.name == null || command.name === ""
      ? formatDefaultName(DEFAULT_PROJECT_NAME_FORMAT, projectCount + 1)
      : command.name;
  const newProject = ProjectEntity.create({
    id: command.projectId ?? null,
    userId,
    name: projectName,
    description: command.description ?? null,
    isDefault: command.isDefaultProject,
    evaluationType: command.type ?? null,
  });
  return ProjectRepository.save(ctx.db, newProject);
}

export async function createProject(
  ctx: Ctx,
  user: UserRef,
  command: CreateProjectCommand,
): Promise<ProjectDTO.ProjectDTO> {
  return ProjectDTO.of(await createProjectEntity(ctx, command, user));
}

/** Creates the sample project at sign-up; never fails the sign-up (returns null on error). */
export async function createDefaultProject(ctx: Ctx, user: AuthUser): Promise<ProjectDTO.ProjectDTO | null> {
  try {
    return await SampleProjectService.createSampleProjectForUser(ctx, user);
  } catch (e) {
    console.error(`Failed to create sample project for user: ${user.id}`, e);
    return null;
  }
}

export async function getProjectForUser(ctx: Ctx, user: UserRef, projectId: string): Promise<Project> {
  const project = await ProjectRepository.findByUserAndId(ctx.db, uid(user), projectId);
  if (!project) throw new NotFoundException(projectId + " can't be found");
  return project;
}

export async function getProject(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  include: string | null | undefined,
): Promise<ProjectDTO.ProjectDTO> {
  const project = await getProjectForUser(ctx, user, projectId);
  return (await enrichProjectsWithFields(ctx, [project], parseIncludeFields(include)))[0];
}

export async function getProjectInferenceMonitoringSummary(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
): Promise<ProjectInferenceMonitoringSummaryDTO> {
  return InferenceMonitoringRepository.getProjectInferenceMonitoringSummary(ctx.db, projectId, uid(user));
}

export async function getHumanEvalMetrics(ctx: Ctx, user: UserRef, projectId: string): Promise<HumanEvalMetricsDTO> {
  return buildHumanEvalMetrics(ctx, await getProjectForUser(ctx, user, projectId));
}

export async function updateProjectIgnoreOutputOnlyFields(
  ctx: Ctx,
  projectId: string,
  command: UpdateProjectCommand,
  user: UserRef,
): Promise<ProjectDTO.ProjectDTO> {
  const project = await ProjectRepository.findByUserAndId(ctx.db, uid(user), projectId);
  if (!project) throw new NotFoundException("Project " + projectId + " not found");
  if (command.name != null) project.name = command.name;
  if (command.description != null) project.description = command.description;
  return ProjectDTO.of(await ProjectRepository.save(ctx.db, project));
}

/** `entityManager.getReference(Project.class, id)`: an id-only reference (null for a null id). */
export function getProjectReference(_ctx: Ctx, projectId: string | null): Project | null {
  if (projectId == null) return null;
  return ProjectEntity.create({ id: projectId });
}

export async function findAllByUser(ctx: Ctx, user: UserRef): Promise<Project[]> {
  return ProjectRepository.findAllByUser(ctx.db, uid(user));
}

export async function getDistinctModelProvidersByProject(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
): Promise<ModelProvider[]> {
  return ChatTurnRepository.findDistinctModelProvidersByContainerId(ctx.db, projectId, uid(user));
}

export async function getProjectEvaluationAnalyticsByScorer(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  scorerId: string,
): Promise<ProjectEvaluationAnalyticsByScorer.ProjectEvaluationAnalyticsByScorer> {
  const project = await getProjectForUser(ctx, user, projectId);
  const entry = (await analyticsEntries(ctx, user, project.id as string, [scorerId]))[0];
  if (!entry) return ProjectEvaluationAnalyticsByScorer.create();
  return ProjectEvaluationAnalyticsByScorer.fromDatapoints(entry.datapoints, entry.scorerId, entry.scorerName);
}

export async function getProjectEvaluationAnalyticsForAllScorers(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
): Promise<ProjectEvaluationAnalyticsByScorer.ProjectEvaluationAnalyticsByScorer[]> {
  const project = await getProjectForUser(ctx, user, projectId);
  return (await analyticsEntries(ctx, user, project.id as string, null)).map((e) =>
    ProjectEvaluationAnalyticsByScorer.fromDatapoints(e.datapoints, e.scorerId, e.scorerName),
  );
}

// ---------------------------------------------------------------------------------------------

/** UserEvalMonitoringService.getAnalyticsMonitoringData from the beginning of unix time. */
async function analyticsEntries(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  scorerIds: string[] | null,
): Promise<UserEvalChartEntryDTO[]> {
  const params = UserEvalMonitoringParams.create({ startTime: new Date(0), projectId, scorerIds });
  const analytics = await UserEvalMonitoringService.getAnalyticsMonitoringData(ctx, user, params);
  return Object.values(analytics ?? {});
}

function parseIncludeFields(include: string | null | undefined): Set<string> {
  if (include == null || !include.trim()) return new Set();
  const fields = include
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const normalized = new Set<string>();
  for (const field of fields) {
    if (field.toLowerCase() === ALL_FIELDS) return new Set(ALLOWED_INCLUDE_FIELDS);
    if ((ALLOWED_INCLUDE_FIELDS as readonly string[]).includes(field)) normalized.add(field);
    else console.warn(`Unknown include field: ${field}`);
  }
  return normalized;
}

async function enrichProjectsWithFields(
  ctx: Ctx,
  projects: Project[],
  includeFields: Set<string>,
): Promise<ProjectDTO.ProjectDTO[]> {
  if (!projects.length) return [];
  const projectIds = projects.map((p) => p.id as string);

  let jobStatusMap = new Map<string, JobStatusDTO[]>();
  if (includeFields.has("jobStatuses")) {
    // User user = projects.get(0).getUser()
    jobStatusMap = await JobStatusService.findAllJobStatusGroupedByProject(ctx, { id: projects[0].userId }, projectIds);
  }

  const out: ProjectDTO.ProjectDTO[] = [];
  for (const project of projects) out.push(await enrichSingleProjectWithFields(ctx, project, jobStatusMap, includeFields));
  return out;
}

async function enrichSingleProjectWithFields(
  ctx: Ctx,
  project: Project,
  jobStatusMap: Map<string, JobStatusDTO[]>,
  includeFields: Set<string>,
): Promise<ProjectDTO.ProjectDTO> {
  const dto = ProjectDTO.from(project);
  const projectId = project.id as string;

  if (includeFields.has("jobStatuses")) {
    // Sorted by start time, newest first, nulls last.
    const jobStatuses = [...(jobStatusMap.get(projectId) ?? [])].sort((a, b) => {
      if (a.start_time == null) return b.start_time == null ? 0 : 1;
      if (b.start_time == null) return -1;
      return Date.parse(b.start_time) - Date.parse(a.start_time);
    });
    const sum = (f: (j: JobStatusDTO) => number | undefined) => jobStatuses.reduce((a, j) => a + (f(j) ?? 0), 0);
    dto.job_statuses = jobStatuses;
    dto.total_job_tasks = sum((j) => j.total);
    dto.finished_job_tasks = sum((j) => j.successful) + sum((j) => j.failed);
  }

  if (includeFields.has("modelProviders")) {
    dto.providers = await ChatTurnRepository.findDistinctModelProvidersByContainerId(
      ctx.db,
      projectId,
      project.userId as string,
    );
  }

  if (includeFields.has("inferenceMetrics")) {
    dto.inference_monitoring_summary = await InferenceMonitoringRepository.getProjectInferenceMonitoringSummary(
      ctx.db,
      projectId,
      project.userId as string,
    );
  }

  if (includeFields.has("humanEvalMetrics")) dto.human_eval_metrics = await buildHumanEvalMetrics(ctx, project);
  if (includeFields.has("latestEvalScore")) dto.latest_eval_score = await buildLatestEvalScore(ctx, project);

  return ProjectDTO.toJson(dto);
}

async function buildHumanEvalMetrics(ctx: Ctx, project: Project): Promise<HumanEvalMetricsDTO> {
  const scores = await HumanEvalScoreRepository.findAllByContainerId(ctx.db, project.id as string);
  // Score.intValue(): truncation towards zero.
  const ints = scores.filter((s) => s.score != null).map((s) => Math.trunc(s.score as number));
  const nonZero = ints.filter((v) => v !== 0);
  const scoreCounts: Record<string, number> = {};
  for (const v of nonZero) scoreCounts[String(v)] = (scoreCounts[String(v)] ?? 0) + 1;
  const passCount = ints.filter((v) => v === 1).length;
  const totalCount = nonZero.length;
  return { scoreCounts, passRate: totalCount > 0 ? passCount / totalCount : null };
}

async function buildLatestEvalScore(ctx: Ctx, project: Project): Promise<LatestEvalScoreDTO | null> {
  const evaluator = await LLMEvaluatorRepository.findLatestRunEvaluatorByContainerId(ctx.db, project.id as string);
  if (!evaluator) return null;
  const avgScore = await ScoreV2Repository.findAvgScoreByEvaluatorIdAndProjectId(
    ctx.db,
    evaluator.id as string,
    project.id as string,
  );
  return { name: evaluator.name, avg_score: avgScore };
}
