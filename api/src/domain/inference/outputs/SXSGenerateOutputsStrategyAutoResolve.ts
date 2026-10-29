/**
 * Port of SXSGenerateOutputsStrategyAutoResolve: duplicates mismatching pairs, runs missing
 * sides, clears and re-runs matching ones; without a model for a side, re-runs sides that have
 * a model but no text with their existing model.
 */
import type { Model } from "../../../entities/Model";
import type { LoadedChat, LoadedChatTurn } from "../service/ChatTurnGraph";
import { type QueueData, getTotalCount, hasChatTurns, newQueueData } from "./QueueData";
import * as SXSChatDuplicationUtils from "./SXSChatDuplicationUtils";
import { SXSGenerateOutputsStrategy } from "./SXSGenerateOutputsStrategy";

function hasText(s: string | null | undefined): boolean {
  return s != null && s.trim() !== "";
}

export class SXSGenerateOutputsStrategyAutoResolve extends SXSGenerateOutputsStrategy {
  protected async duplicateChats(): Promise<void> {
    const pairsToDuplicate = SXSChatDuplicationUtils.findPairsWithModelMismatch(
      this.sxsPairs,
      this.modelA,
      this.modelB,
      this.failedSxsPairIds,
    );
    if (pairsToDuplicate.length) {
      const newPairs = await SXSChatDuplicationUtils.createNewPairsForMismatches(this.ctx, pairsToDuplicate, this.user);
      this.newSxsPairIds.push(...newPairs.map((p) => p.id as string));
      this.sxsPairs.push(...newPairs);
    }
  }

  protected async sendToQueue(): Promise<void> {
    const queueData = await this.collectChatTurnsForQueue();
    if (hasChatTurns(queueData)) {
      const job = await this.createJobStatus(getTotalCount(queueData));
      const isBulk = getTotalCount(queueData) > 10;
      await this.sendNewModelInferences(queueData.chatTurnsForNewModel, queueData.turnToModelId, job, isBulk);
      await this.sendExistingModelInferences(queueData.chatTurnsWithExistingModel, job);
    }
  }

  private async collectChatTurnsForQueue(): Promise<QueueData> {
    const chatTurnsForNewModel: LoadedChatTurn[] = [];
    const chatTurnsWithExistingModel: LoadedChatTurn[] = [];
    const turnToModelId = new Map<string, string>();
    const chatTurnsToClear: LoadedChatTurn[] = [];
    for (const sxsPair of this.sxsPairs) {
      if (!this.isPairFailed(sxsPair)) {
        this.processSide(sxsPair.chatA, this.modelA, chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId, chatTurnsToClear);
        this.processSide(sxsPair.chatB, this.modelB, chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId, chatTurnsToClear);
      }
    }
    if (chatTurnsToClear.length) await this.clearModelOutputs(chatTurnsToClear);
    return newQueueData(chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId);
  }

  private processSide(
    chat: LoadedChat | null,
    inputModel: Model | null,
    chatTurnsForNewModel: LoadedChatTurn[],
    chatTurnsWithExistingModel: LoadedChatTurn[],
    turnToModelId: Map<string, string>,
    chatTurnsToClear: LoadedChatTurn[],
  ): void {
    if (chat == null) return;
    const latestTurn = SXSChatDuplicationUtils.latestTurnOf(chat);
    const modelResponse = latestTurn.modelResponse;

    if (inputModel == null) {
      if (modelResponse != null && modelResponse.model != null && !hasText(modelResponse.text)) {
        chatTurnsWithExistingModel.push(latestTurn);
      }
      return;
    }
    if (modelResponse == null || modelResponse.model == null) {
      this.addToNewModelQueue(latestTurn, inputModel, chatTurnsForNewModel, turnToModelId);
      return;
    }
    if (modelResponse.model.id === inputModel.id) {
      chatTurnsToClear.push(latestTurn);
      this.addToNewModelQueue(latestTurn, inputModel, chatTurnsForNewModel, turnToModelId);
      return;
    }
    this.addToNewModelQueue(latestTurn, inputModel, chatTurnsForNewModel, turnToModelId);
  }

  private addToNewModelQueue(
    chatTurn: LoadedChatTurn,
    model: Model,
    chatTurnsForNewModel: LoadedChatTurn[],
    turnToModelId: Map<string, string>,
  ): void {
    chatTurnsForNewModel.push(chatTurn);
    turnToModelId.set(chatTurn.id as string, model.id as string);
  }
}
