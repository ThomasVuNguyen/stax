/**
 * Port of domain/inference/outputs/GenerateOutputsFactory(+Impl): picks the output generation
 * strategy for the project type and mode, validating the models for the project owner.
 */
import type { Ctx } from "../../../lib/ctx";
import { IllegalArgumentException, IllegalInputException, UnsupportedOperationException } from "../../../lib/errors";
import type { Model } from "../../../entities/Model";
import type { Project } from "../../../entities/Project";
import type { User } from "../../../entities/User";
import { EvaluationType } from "../../../enums/EvaluationType";
import { SXSGenerateOutputsMode } from "../../../enums/SXSGenerateOutputsMode";
import * as ModelService from "../../model/service/ModelService";
import * as UserService from "../../user/UserService";
import type { SXSGenerateOutputsResponse } from "../dto/SXSGenerateOutputsResponse";
import { javaRuntimeException } from "../service/JavaExceptions";
import type { GenerateOutputsStrategy } from "./GenerateOutputsStrategy";
import type { SXSGenerateOutputsStrategy } from "./SXSGenerateOutputsStrategy";
import { SXSGenerateOutputsStrategyAutoResolve } from "./SXSGenerateOutputsStrategyAutoResolve";
import { SXSGenerateOutputsStrategyDuplicate } from "./SXSGenerateOutputsStrategyDuplicate";
import { SXSGenerateOutputsStrategyMissingAndMatching } from "./SXSGenerateOutputsStrategyMissingAndMatching";
import { SXSGenerateOutputsStrategyMissingOnly } from "./SXSGenerateOutputsStrategyMissingOnly";
import { SXSGenerateOutputsStrategyRunOrRerun } from "./SXSGenerateOutputsStrategyRunOrRerun";

export async function getStrategy(
  ctx: Ctx,
  modelA: string | null | undefined,
  modelB: string | null | undefined,
  mode: SXSGenerateOutputsMode | null | undefined,
  project: Project,
): Promise<GenerateOutputsStrategy<unknown>> {
  switch (project.evaluationType) {
    case EvaluationType.SXS:
      return getSXSGenerateOutputsStrategy(ctx, modelA ?? null, modelB ?? null, mode ?? null, project);
    case EvaluationType.POINTWISE:
      // TODO (Java): Implement Pointwise strategy when ready
      throw new UnsupportedOperationException("Pointwise output generation not yet implemented");
    default:
      throw new IllegalArgumentException(`Invalid project type: ${project.evaluationType}`);
  }
}

async function getSXSGenerateOutputsStrategy(
  ctx: Ctx,
  modelIdA: string | null,
  modelIdB: string | null,
  mode: SXSGenerateOutputsMode | null,
  project: Project,
): Promise<GenerateOutputsStrategy<SXSGenerateOutputsResponse>> {
  const user = await UserService.findByUserId(ctx, project.userId as string); // project.getUser()
  const modelA = await getModelForUser(ctx, user, modelIdA);
  const modelB = await getModelForUser(ctx, user, modelIdB);
  const args = [ctx, modelA, modelB, project, user] as const;
  let strategy: SXSGenerateOutputsStrategy;
  switch (mode) {
    case SXSGenerateOutputsMode.MISSING_ONLY:
      strategy = new SXSGenerateOutputsStrategyMissingOnly(...args);
      break;
    case SXSGenerateOutputsMode.MISSING_AND_MATCHING:
      strategy = new SXSGenerateOutputsStrategyMissingAndMatching(...args);
      break;
    case SXSGenerateOutputsMode.RUN_OR_RERUN:
      strategy = new SXSGenerateOutputsStrategyRunOrRerun(...args);
      break;
    case SXSGenerateOutputsMode.DUPLICATE:
      strategy = new SXSGenerateOutputsStrategyDuplicate(...args);
      break;
    case SXSGenerateOutputsMode.AUTORESOLVE:
      strategy = new SXSGenerateOutputsStrategyAutoResolve(...args);
      break;
    case null:
      throw javaRuntimeException(null); // switch on a null enum
    default:
      throw new IllegalArgumentException(`Invalid mode: ${mode}`);
  }
  return strategy;
}

async function getModelForUser(ctx: Ctx, user: User, modelId: string | null): Promise<Model | null> {
  if (modelId == null) return null;
  const model = await ModelService.getModelForUser(ctx, user, modelId);
  if (model.isDeprecated) throw new IllegalInputException("Unable to run inference with deprecated model");
  return model;
}
