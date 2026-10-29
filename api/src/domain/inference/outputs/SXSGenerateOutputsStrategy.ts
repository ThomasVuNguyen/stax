/**
 * Port of domain/inference/outputs/SXSGenerateOutputsStrategy (abstract base of the SxS modes).
 *
 * Dependencies are modules instead of injected setters. Inference requests are collected in an
 * outbox and sent after `sendToQueue()` (also when it throws, so rows prepared before a failure
 * are still sent, as Java had already published them).
 */
import type { Ctx } from "../../../lib/ctx";
import type { JobStatus } from "../../../entities/JobStatus";
import type { Model } from "../../../entities/Model";
import type { Project } from "../../../entities/Project";
import type { User } from "../../../entities/User";
import { JobStatusEnum } from "../../../enums/JobStatusEnum";
import * as PlanckConstants from "../../../util/PlanckConstants";
import * as SxsEvaluationPairRepository from "../../evaluation/SxsEvaluationPairRepository";
import * as JobStatusService from "../../job/JobStatusService";
import * as InferencePublisherService from "../../pubsub/InferencePublisherService";
import { type InferenceDTO, newInferenceDTO } from "../dto/InferenceDTO";
import type { SXSGenerateOutputsResponse } from "../dto/SXSGenerateOutputsResponse";
import { type LoadedChatTurn, getLatestTurn, loadChatTurnsOfAll, loadChats } from "../service/ChatTurnGraph";
import { GenerateOutputsStrategy } from "./GenerateOutputsStrategy";
import { type LoadedSxsPair, duplicateChatsForSideB, latestTurnOf } from "./SXSChatDuplicationUtils";

export abstract class SXSGenerateOutputsStrategy extends GenerateOutputsStrategy<SXSGenerateOutputsResponse> {
  protected sxsPairs: LoadedSxsPair[] = [];
  protected sxsPairIds: string[] = [];
  protected newSxsPairIds: string[] = [];
  protected failedSxsPairIds: string[] = [];
  protected skippedSxsPairIds: string[] = [];
  protected readonly outbox = InferencePublisherService.newOutbox();

  constructor(
    protected readonly ctx: Ctx,
    protected modelA: Model | null,
    protected modelB: Model | null,
    protected project: Project,
    /** project.getUser() */
    protected user: User,
  ) {
    super();
  }

  async generateOutputs(sxsPairIds: string[]): Promise<SXSGenerateOutputsResponse> {
    await this.initializeData(sxsPairIds);
    await this.validateInputs();
    await this.populateMissingSideChats();
    await this.duplicateChats();
    try {
      await this.sendToQueue();
    } finally {
      await InferencePublisherService.flushOutbox(this.ctx, this.outbox);
    }
    return {
      newSxsPairIds: this.newSxsPairIds,
      failedSxsPairIds: this.failedSxsPairIds,
      skippedSxsPairIds: this.skippedSxsPairIds,
    };
  }

  /** findByIdInWithChatAEagerFetching + the lazily loaded chatB, with all turns of both chats. */
  private async initializeData(sxsPairIds: string[]): Promise<void> {
    this.sxsPairIds = sxsPairIds;
    const pairs = await SxsEvaluationPairRepository.findByIdInWithChatAEagerFetching(this.ctx.db, sxsPairIds);
    const chats = await loadChats(
      this.ctx.db,
      pairs.flatMap((p) => [p.chatAId, p.chatBId]).filter((x): x is string => !!x),
    );
    await loadChatTurnsOfAll(this.ctx.db, [...chats.values()]);
    this.sxsPairs = pairs.map((p) =>
      Object.assign(p, {
        chatA: p.chatAId ? (chats.get(p.chatAId) ?? null) : null,
        chatB: p.chatBId ? (chats.get(p.chatBId) ?? null) : null,
      }),
    );
  }

  protected async validateInputs(): Promise<void> {
    for (const sxsPair of this.sxsPairs) {
      if (sxsPair.chatA == null) this.failedSxsPairIds.push(sxsPair.id as string);
    }
  }

  protected async populateMissingSideChats(): Promise<void> {
    if (this.modelB == null) return;
    const pairsNeedingSideB = this.findPairsMissingSideB();
    if (!pairsNeedingSideB.length) return;
    await this.createMissingSideBChats(pairsNeedingSideB);
    await this.saveUpdatedPairs(pairsNeedingSideB);
  }

  protected findPairsMissingSideB(): LoadedSxsPair[] {
    return this.sxsPairs.filter((pair) => pair.chatB == null && !this.isPairFailed(pair));
  }

  protected isPairFailed(pair: LoadedSxsPair): boolean {
    return this.failedSxsPairIds.includes(pair.id as string);
  }

  protected async createMissingSideBChats(pairsNeedingSideB: LoadedSxsPair[]): Promise<void> {
    const sideAChats = pairsNeedingSideB.map((p) => p.chatA!);
    const newSideBChatsMap = await duplicateChatsForSideB(this.ctx, sideAChats, this.user);
    for (const pair of pairsNeedingSideB) {
      const newSideBChat = newSideBChatsMap.get(pair.chatA!.id as string)!;
      pair.chatB = newSideBChat;
      pair.chatBId = newSideBChat.id;
      pair.chatTurnBId = getLatestTurn(newSideBChat)?.id ?? null;
    }
  }

  /** saveAll keeps the same objects, so the in-memory list already holds the saved pairs. */
  protected async saveUpdatedPairs(updatedPairs: LoadedSxsPair[]): Promise<void> {
    await SxsEvaluationPairRepository.saveAll(this.ctx.db, updatedPairs);
  }

  protected async createJobStatus(totalChatTurns: number): Promise<JobStatus> {
    return JobStatusService.createScorerJobStatus(
      this.ctx,
      PlanckConstants.INFERENCE,
      null,
      this.user,
      JobStatusEnum.PENDING,
      totalChatTurns,
      this.project,
    );
  }

  protected createInferenceDTO(job: JobStatus, chatTurn: LoadedChatTurn): InferenceDTO {
    return newInferenceDTO({
      user_id: this.user.id,
      project_id: this.project.id,
      job_id: job.id,
      chat_turn_id: chatTurn.id,
    });
  }

  protected async sendNewModelInferences(
    chatTurns: LoadedChatTurn[],
    turnToModelId: Map<string, string>,
    job: JobStatus,
    isBulk: boolean,
  ): Promise<void> {
    for (const chatTurn of chatTurns) {
      const dto = this.createInferenceDTO(job, chatTurn);
      await InferencePublisherService.sendInferenceWithModel(
        this.ctx,
        chatTurn,
        dto,
        turnToModelId.get(chatTurn.id as string) as string,
        false,
        isBulk,
        this.outbox,
      );
    }
  }

  protected async sendExistingModelInferences(chatTurns: LoadedChatTurn[], job: JobStatus): Promise<void> {
    for (const chatTurn of chatTurns) {
      const dto = this.createInferenceDTO(job, chatTurn);
      await InferencePublisherService.sendInferenceUsingExistingModel(this.ctx, chatTurn, dto, this.outbox);
    }
  }

  /**
   * Detaches the responses in memory (the following inference creates a fresh empty response for
   * the turn) and re-saves the pairs containing those turns. As in Java, the turns themselves are
   * not saved here (the pair has no cascade to them).
   */
  protected async clearModelOutputs(chatTurnsToClear: LoadedChatTurn[]): Promise<void> {
    for (const chatTurn of chatTurnsToClear) chatTurn.modelResponse = null;
    const ids = new Set(chatTurnsToClear.map((t) => t.id));
    const pairsToSave = this.sxsPairs.filter(
      (pair) =>
        (pair.chatA != null && ids.has(latestTurnOf(pair.chatA).id)) ||
        (pair.chatB != null && ids.has(latestTurnOf(pair.chatB).id)),
    );
    await SxsEvaluationPairRepository.saveAll(this.ctx.db, pairsToSave);
  }
}
