/** Port of domain/tags/repository/InferenceMonitoringFetcher (@TaggableEntityFetcher(INFERENCE_MONITORING)). */
import type { Ctx } from "../../../lib/ctx";
import * as InferenceMonitoringRepository from "../../inferencemonitoring/InferenceMonitoringRepository";
import { type InferenceMonitoringDTO, newInferenceMonitoringDTO } from "../../chatturn/dto/ChatTurnDtoSupport";

export async function findAllByIds(
  ctx: Ctx,
  ids: string[],
  user: { id: string | null },
): Promise<InferenceMonitoringDTO[]> {
  const list = await InferenceMonitoringRepository.findInferenceMonitroginsByList(ctx.db, ids, user.id as string);
  return list.map(newInferenceMonitoringDTO);
}
