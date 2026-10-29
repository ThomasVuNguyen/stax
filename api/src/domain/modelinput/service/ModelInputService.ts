/**
 * Port of domain/modelinput/service/ModelInputService + ModelInputServiceImpl.
 * Overloads: `savePrompt(ctx, user, prompt, variables?)`; `saveAll(ctx, inputs)` and
 * `saveAllPrompts(ctx, user, prompts, variables)` (Java `saveAll(User, List<Prompt>, Map)`).
 */
import type { Ctx } from "../../../lib/ctx";
import { NotFoundException } from "../../../lib/errors";
import { type ModelInput, fromPrompt } from "../../../entities/ModelInput";
import type { Prompt } from "../../../llmproviders/dto/Prompt";
import { containsVariableInput } from "../../../util/PromptUtil";
import * as ModelInputRepository from "../ModelInputRepository";
import { type ModelInputDTO, newModelInputDTO } from "../dto/ModelInputDTO";

type UserRef = { id: string | null };

export async function save(ctx: Ctx, input: ModelInput): Promise<ModelInput> {
  return ModelInputRepository.save(ctx.db, input);
}

/** `savePrompt(user, prompt)` / `savePrompt(user, prompt, variables)`. */
export async function savePrompt(
  ctx: Ctx,
  user: UserRef,
  prompt: Prompt,
  variables: Record<string, string> | null = null,
): Promise<ModelInput> {
  return ModelInputRepository.save(ctx.db, fromPrompt(prompt, user.id, variables));
}

export async function getModelInput(ctx: Ctx, user: UserRef, modelInputId: string): Promise<ModelInputDTO> {
  const modelInput = await ModelInputRepository.findByUserAndId(ctx.db, user.id as string, modelInputId);
  if (!modelInput) throw new NotFoundException(`${modelInputId} can't be found`);
  return newModelInputDTO(modelInput);
}

export async function saveAll(ctx: Ctx, inputs: ModelInput[]): Promise<ModelInput[]> {
  return ModelInputRepository.saveAllAndFlush(ctx.db, inputs);
}

/** Java `saveAll(User, List<Prompt>, Map<String, String>)`: variables only on prompts using them. */
export async function saveAllPrompts(
  ctx: Ctx,
  user: UserRef,
  prompts: Prompt[],
  variables: Record<string, string> | null,
): Promise<ModelInput[]> {
  const inputs = prompts.map((p) =>
    fromPrompt(p, user.id, containsVariableInput(p.text as string) ? variables : null),
  );
  return ModelInputRepository.saveAll(ctx.db, inputs);
}
