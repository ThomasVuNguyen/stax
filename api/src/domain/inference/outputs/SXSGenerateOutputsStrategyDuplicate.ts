/**
 * Port of SXSGenerateOutputsStrategyDuplicate: pairs whose outputs came from another model are
 * duplicated into new pairs; sides without output (or with the same model) are (re)run.
 */
import { IllegalInputException } from "../../../lib/errors";
import type { Model } from "../../../entities/Model";
import type { LoadedChat, LoadedChatTurn, LoadedModelResponse } from "../service/ChatTurnGraph";
import { type QueueData, getTotalCount, hasChatTurns, newQueueData } from "./QueueData";
import * as SXSChatDuplicationUtils from "./SXSChatDuplicationUtils";
import { SXSGenerateOutputsStrategy } from "./SXSGenerateOutputsStrategy";

export class SXSGenerateOutputsStrategyDuplicate extends SXSGenerateOutputsStrategy {
  protected override async validateInputs(): Promise<void> {
    await super.validateInputs();
    if (this.modelA == null && this.modelB == null) throw new IllegalInputException("Model A or Model B is required");
  }

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
        this.processSide(sxsPair.chatA, this.modelA, chatTurnsForNewModel, turnToModelId, chatTurnsToClear);
        this.processSide(sxsPair.chatB, this.modelB, chatTurnsForNewModel, turnToModelId, chatTurnsToClear);
      }
    }
    if (chatTurnsToClear.length) await this.clearModelOutputs(chatTurnsToClear);
    return newQueueData(chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId);
  }

  private processSide(
    chat: LoadedChat | null,
    model: Model | null,
    chatTurnsForNewModel: LoadedChatTurn[],
    turnToModelId: Map<string, string>,
    chatTurnsToClear: LoadedChatTurn[],
  ): void {
    if (model == null || chat == null) return;
    const latestTurn = SXSChatDuplicationUtils.latestTurnOf(chat);
    const modelResponse = latestTurn.modelResponse;
    if (this.shouldRunWithNewModel(modelResponse)) {
      chatTurnsForNewModel.push(latestTurn);
      turnToModelId.set(latestTurn.id as string, model.id as string);
    } else if (this.shouldClearAndRerun(modelResponse, model)) {
      chatTurnsToClear.push(latestTurn);
      chatTurnsForNewModel.push(latestTurn);
      turnToModelId.set(latestTurn.id as string, model.id as string);
    }
  }

  private shouldRunWithNewModel(modelResponse: LoadedModelResponse | null): boolean {
    return modelResponse == null || modelResponse.model == null;
  }

  private shouldClearAndRerun(modelResponse: LoadedModelResponse | null, expectedModel: Model): boolean {
    return modelResponse != null && modelResponse.model != null && modelResponse.model.id === expectedModel.id;
  }
}
