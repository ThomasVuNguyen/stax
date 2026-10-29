/** Port of domain/modelresponse/service/ModelResponseService + ModelResponseServiceImpl. */
import type { Ctx } from "../../../lib/ctx";
import { NotFoundException } from "../../../lib/errors";
import { type ModelResponse, create } from "../../../entities/ModelResponse";
import { loadModelResponse } from "../../chatturn/LoadedChatTurn";
import * as ModelResponseRepository from "../ModelResponseRepository";
import { type ModelResponseDTO, newModelResponseDTO } from "../ModelResponseDTO";

type UserRef = { id: string | null };

export async function saveModelResponse(ctx: Ctx, modelResponse: ModelResponse): Promise<ModelResponse> {
  return ModelResponseRepository.saveAndFlush(ctx.db, modelResponse);
}

export async function getModelResponse(ctx: Ctx, user: UserRef, modelResponseId: string): Promise<ModelResponseDTO> {
  const modelResponse = await ModelResponseRepository.findByUserAndId(ctx.db, user.id as string, modelResponseId);
  if (!modelResponse) throw new NotFoundException(`${modelResponseId} can't be found`);
  return newModelResponseDTO(await loadModelResponse(ctx.db, modelResponse));
}

export async function deleteById(ctx: Ctx, user: UserRef, id: string): Promise<void> {
  const modelResponse = await ModelResponseRepository.findByUserAndId(ctx.db, user.id as string, id);
  if (!modelResponse) throw new NotFoundException("ModelResponse not found");
  await ModelResponseRepository.delete(ctx.db, modelResponse);
}

export async function deleteByContainer(ctx: Ctx, container: { id: string | null }): Promise<void> {
  await ModelResponseRepository.deleteAllByContainer(ctx.db, container.id as string);
}

export async function createModelResponse(
  ctx: Ctx,
  user: UserRef,
  container: { id: string | null } | null,
  model: { id: string | null } | null,
): Promise<ModelResponse> {
  return saveModelResponse(
    ctx,
    create({ modelId: model?.id ?? null, userId: user.id, containerId: container?.id ?? null }),
  );
}
