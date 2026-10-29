/**
 * Port of domain/importexport/SxsExportService + SxsExportServiceImpl.
 * ProjectService.getProjectForUser was `projectRepository.findByUserAndId` + NotFoundException; it is
 * done on the repository here.
 */
import type { Chat } from "../../entities/Chat";
import type { SxsEvaluationPair } from "../../entities/SxsEvaluationPair";
import { EvaluationType } from "../../enums/EvaluationType";
import type { Ctx } from "../../lib/ctx";
import { IllegalArgumentException, NotFoundException } from "../../lib/errors";
import * as ChatRepository from "../chat/ChatRepository";
import * as SXSHumanFeedbackRepository from "../evaluation/SXSHumanFeedbackRepository";
import * as SxsEvaluationPairRepository from "../evaluation/SxsEvaluationPairRepository";
import * as ProjectRepository from "../project/ProjectRepository";
import * as ChatExportService from "./ChatExportService";
import type { SXSHumanEvalRatingExportDTO } from "./dto/SXSHumanEvalRatingExportDTO";
import * as SxsEvaluationPairExportDTO from "./dto/SxsEvaluationPairExportDTO";

type UserRef = { id: string | null };

export async function exportSxsPair(
  ctx: Ctx,
  pairId: string,
  user: UserRef,
  projectId: string,
): Promise<SxsEvaluationPairExportDTO.SxsEvaluationPairExportDTO> {
  const pair = await SxsEvaluationPairRepository.findByIdAndUser(ctx.db, pairId, user.id ?? "");
  if (!pair || pair.containerId !== projectId) {
    throw new NotFoundException("SxsEvaluationPair not found with id: " + pairId);
  }
  return toSxsEvaluationPairExportDTO(ctx, pair, user);
}

export async function exportSxsPairsForProject(
  ctx: Ctx,
  projectId: string,
  user: UserRef,
): Promise<SxsEvaluationPairExportDTO.SxsEvaluationPairExportDTO[]> {
  const project = await getProjectForUser(ctx, user, projectId);
  if (project.evaluationType !== EvaluationType.SXS) {
    throw new IllegalArgumentException("Bulk export of SxS pairs is only available for 'SXS' type projects.");
  }
  const pairs = await SxsEvaluationPairRepository.findByContainer(ctx.db, project.id as string);
  return mapSequential(pairs, (p) => toSxsEvaluationPairExportDTO(ctx, p, user));
}

export async function exportSxsPairsByIds(
  ctx: Ctx,
  projectId: string,
  pairIds: string[] | null,
  user: UserRef,
): Promise<SxsEvaluationPairExportDTO.SxsEvaluationPairExportDTO[]> {
  const project = await getProjectForUser(ctx, user, projectId);
  if (!pairIds || !pairIds.length) return [];
  const pairs = await SxsEvaluationPairRepository.findAllByIdInAndContainer(ctx.db, pairIds, project.id as string);
  return mapSequential(pairs, (p) => toSxsEvaluationPairExportDTO(ctx, p, user));
}

async function getProjectForUser(ctx: Ctx, user: UserRef, projectId: string) {
  const project = await ProjectRepository.findByUserAndId(ctx.db, user.id ?? "", projectId);
  if (!project) throw new NotFoundException(projectId + " can't be found");
  return project;
}

async function mapSequential<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (const item of items) out.push(await fn(item));
  return out;
}

async function loadChat(ctx: Ctx, chatId: string | null): Promise<Chat | null> {
  return chatId ? ChatRepository.findById(ctx.db, chatId) : null;
}

async function toSxsEvaluationPairExportDTO(
  ctx: Ctx,
  pair: SxsEvaluationPair,
  user: UserRef,
): Promise<SxsEvaluationPairExportDTO.SxsEvaluationPairExportDTO> {
  const chatAHistory = await ChatExportService.getChatHistory(ctx, await loadChat(ctx, pair.chatAId), user);
  const chatB = await loadChat(ctx, pair.chatBId);
  const chatBHistory = chatB ? await ChatExportService.getChatHistory(ctx, chatB, user) : [];
  let humanSxsRatings: SXSHumanEvalRatingExportDTO[] | null = null;
  if (chatAHistory.length && chatBHistory.length) {
    humanSxsRatings = await SXSHumanFeedbackRepository.getHumanFeedbackExportDTOsByPairId(ctx.db, pair.id as string);
  }
  return SxsEvaluationPairExportDTO.build({
    variables: pair.variables,
    humanSxsRatings,
    expectedOutput: pair.expectedOutput,
    chatA: chatAHistory,
    chatB: chatBHistory,
  });
}
