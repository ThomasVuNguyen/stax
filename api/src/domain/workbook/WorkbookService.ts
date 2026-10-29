/**
 * Port of domain/workbook/WorkbookService(+Impl). Signatures mirror Java (`User user` → any `{ id }`;
 * `getData` also accepts the user omitted → `requireUser(ctx)`).
 * `getData` also does what TagResponseEnrichmentAdvice did to its response (tags on every row,
 * "tags" removed from empty_columns once a tag is found), so every caller (WorkbookController,
 * DataSetController) gets the same JSON as before.
 */
import type { Ctx } from "../../lib/ctx";
import { requireUser } from "../../lib/ctx";
import { NotFoundException } from "../../lib/errors";
import * as ChatService from "../chat/service/ChatService";
import * as ChatTurnRepository from "../chatturn/ChatTurnRepository";
import * as EvaluationContainerRepository from "../project/EvaluationContainerRepository";
import * as EvaluationContainerService from "../project/EvaluationContainerService";
import * as ProjectService from "../project/ProjectService";
import { applyTags } from "./dto/BaseWorkbookRowDTO";
import * as ChatWorkbookRowDTO from "./dto/ChatWorkbookRowDTO";
import * as GetWorkbookResponseDTO from "./dto/GetWorkbookResponseDTO";

type UserRef = { id: string | null };

/** Status200Response. */
export interface Status200Response {
  message: string;
}

type GetDataArgs = [string, number, number, string | null, string | null, string[] | null];

/** `getData(user, containerId, pageSize, pageToken, orderBy, filter, tagIds)`; the user may be omitted. */
export async function getData(ctx: Ctx, user: UserRef, ...args: GetDataArgs): Promise<GetWorkbookResponseDTO.GetWorkbookResponseDTO>;
export async function getData(ctx: Ctx, ...args: GetDataArgs): Promise<GetWorkbookResponseDTO.GetWorkbookResponseDTO>;
export async function getData(
  ctx: Ctx,
  ...rawArgs: [UserRef, ...GetDataArgs] | GetDataArgs
): Promise<GetWorkbookResponseDTO.GetWorkbookResponseDTO> {
  const [user, evaluationContainerId, pageSize, pageToken, , , tagIds] = (
    rawArgs.length === 7 ? rawArgs : [requireUser(ctx), ...rawArgs]
  ) as [UserRef, ...GetDataArgs];
  const container = await EvaluationContainerService.getContainerForUser(ctx, user, evaluationContainerId);
  if (!container) throw new NotFoundException("Container not found for this user");

  // orderBy and filter are currently ignored
  const effectivePageSize = Math.min(pageSize < 1 ? 10000 : pageSize, 10000);
  const pageable = {
    page: pageToken,
    size: effectivePageSize,
    sort: [{ property: "createdAt", direction: "DESC" as const }],
  };
  const page = await ChatService.fetchLastTurns(ctx, user, container, tagIds, pageable);

  const workbookDTO = await ChatWorkbookRowDTO.fromLatestTurns(ctx.db, page.content);
  const nextPageToken = page.number + 1 < page.totalPages ? String(page.number + 1) : null;
  const response = GetWorkbookResponseDTO.create(workbookDTO, nextPageToken, page.totalElements);

  if (await applyTags(ctx, user, response.workbook_rows)) GetWorkbookResponseDTO.removeTagsFromEmptyColumns(response);
  return response;
}

export async function getDeleteChats(
  ctx: Ctx,
  user: UserRef,
  projectId: string,
  chatIds: string[],
): Promise<Status200Response> {
  // ChatService.deleteChats(chatIds, user, containerId)
  const container = await EvaluationContainerRepository.findById(ctx.db, projectId);
  if (!container) throw new NotFoundException("Container not found: " + projectId);
  const chatTurns = await ChatTurnRepository.findAllByUserAndContainerAndChatIdIn(ctx.db, user.id as string, projectId, chatIds);
  await ChatService.delete(ctx, chatTurns);
  return { message: "Chat rows deleted successfully" };
}

export async function deleteChatsByProject(ctx: Ctx, user: UserRef, projectId: string): Promise<Status200Response> {
  const project = await ProjectService.getProjectForUser(ctx, user, projectId);
  const chatTurns = await ChatTurnRepository.findAllByUserAndChatContainer(ctx.db, user.id as string, project.id as string);
  await ChatService.delete(ctx, chatTurns);
  return { message: "Chat rows deleted successfully" };
}
