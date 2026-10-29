/**
 * Port of domain/inference/outputs/SXSGenerateOutputsService(+Impl), used by the SXS controller:
 * - generateAllOutputs(ctx, projectId, request: SXSGenerateOutputsBase, user)
 * - generateOutputs(ctx, projectId, request: SXSGenerateOutputs, user)
 * `mode` defaults to MISSING_ONLY when the JSON omitted it (Java field initialiser).
 */
import type { Ctx } from "../../../lib/ctx";
import { NotFoundException } from "../../../lib/errors";
import type { Project } from "../../../entities/Project";
import type { User } from "../../../entities/User";
import { EvaluationType } from "../../../enums/EvaluationType";
import type { SXSGenerateOutputsMode } from "../../../enums/SXSGenerateOutputsMode";
import * as SxsEvaluationPairRepository from "../../evaluation/SxsEvaluationPairRepository";
import * as ProjectRepository from "../../project/ProjectRepository";
import type { SXSGenerateOutputs } from "../dto/SXSGenerateOutputs";
import { type SXSGenerateOutputsBase, withDefaults } from "../dto/SXSGenerateOutputsBase";
import type { SXSGenerateOutputsResponse } from "../dto/SXSGenerateOutputsResponse";
import * as GenerateOutputsFactory from "./GenerateOutputsFactory";
import type { GenerateOutputsStrategy } from "./GenerateOutputsStrategy";

export async function generateAllOutputs(
  ctx: Ctx,
  projectId: string,
  request: SXSGenerateOutputsBase,
  user: Pick<User, "id">,
): Promise<SXSGenerateOutputsResponse> {
  const project = await getProject(ctx, projectId, user);
  const sxsPairIds = await SxsEvaluationPairRepository.findIdsByContainer(ctx.db, project.id as string);
  if (!sxsPairIds.length) return { newSxsPairIds: [], failedSxsPairIds: [], skippedSxsPairIds: [] };
  const req = withDefaults(request);
  return generate(ctx, project, sxsPairIds, req.modelA ?? null, req.modelB ?? null, req.mode ?? null);
}

export async function generateOutputs(
  ctx: Ctx,
  projectId: string,
  request: SXSGenerateOutputs,
  user: Pick<User, "id">,
): Promise<SXSGenerateOutputsResponse> {
  const project = await getProject(ctx, projectId, user);
  const req = withDefaults(request);
  return generate(ctx, project, req.sxsPairIds ?? [], req.modelA ?? null, req.modelB ?? null, req.mode ?? null);
}

async function generate(
  ctx: Ctx,
  project: Project,
  sxsPairIds: string[],
  modelA: string | null,
  modelB: string | null,
  mode: SXSGenerateOutputsMode | null,
): Promise<SXSGenerateOutputsResponse> {
  const strategy = (await GenerateOutputsFactory.getStrategy(ctx, modelA, modelB, mode, project)) as GenerateOutputsStrategy<SXSGenerateOutputsResponse>;
  return strategy.generateOutputs(sxsPairIds);
}

async function getProject(ctx: Ctx, projectId: string, user: Pick<User, "id">): Promise<Project> {
  const project = await ProjectRepository.findByUserAndId(ctx.db, user.id as string, projectId);
  if (!project) throw new NotFoundException("Project not found for this user");
  if (project.evaluationType !== EvaluationType.SXS) throw new NotFoundException("Project is not an SxS project");
  return project;
}
