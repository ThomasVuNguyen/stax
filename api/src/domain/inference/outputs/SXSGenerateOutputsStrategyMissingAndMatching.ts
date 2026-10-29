/**
 * Port of SXSGenerateOutputsStrategyMissingAndMatching: run sides without output with the given
 * model, and re-run sides whose output came from that same model (with their existing model).
 */
import { IllegalInputException } from "../../../lib/errors";
import type { Model } from "../../../entities/Model";
import type { LoadedChat, LoadedChatTurn, LoadedModelResponse } from "../service/ChatTurnGraph";
import { type QueueData, getTotalCount, hasChatTurns, newQueueData } from "./QueueData";
import { type LoadedSxsPair, latestTurnOf } from "./SXSChatDuplicationUtils";
import { SXSGenerateOutputsStrategy } from "./SXSGenerateOutputsStrategy";

export class SXSGenerateOutputsStrategyMissingAndMatching extends SXSGenerateOutputsStrategy {
  protected override async validateInputs(): Promise<void> {
    await super.validateInputs();
    if (this.modelA == null && this.modelB == null) throw new IllegalInputException("Model A or Model B is required");
  }

  protected async duplicateChats(): Promise<void> {}

  protected async sendToQueue(): Promise<void> {
    const queueData = this.collectChatTurnsForQueue();
    if (hasChatTurns(queueData)) {
      const job = await this.createJobStatus(getTotalCount(queueData));
      const isBulk = getTotalCount(queueData) > 10;
      await this.sendNewModelInferences(queueData.chatTurnsForNewModel, queueData.turnToModelId, job, isBulk);
      await this.sendExistingModelInferences(queueData.chatTurnsWithExistingModel, job);
    }
  }

  private collectChatTurnsForQueue(): QueueData {
    const chatTurnsForNewModel: LoadedChatTurn[] = [];
    const chatTurnsWithExistingModel: LoadedChatTurn[] = [];
    const turnToModelId = new Map<string, string>();
    for (const sxsPair of this.sxsPairs) {
      if (!this.isPairFailed(sxsPair)) {
        this.processSide(sxsPair, sxsPair.chatA, this.modelA, chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId);
        this.processSide(sxsPair, sxsPair.chatB, this.modelB, chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId);
      }
    }
    return newQueueData(chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId);
  }

  /** processSideA / processSideB. */
  private processSide(
    sxsPair: LoadedSxsPair,
    chat: LoadedChat | null,
    model: Model | null,
    chatTurnsForNewModel: LoadedChatTurn[],
    chatTurnsWithExistingModel: LoadedChatTurn[],
    turnToModelId: Map<string, string>,
  ): void {
    if (model == null) return;
    const latestTurn = latestTurnOf(chat);
    const modelResponse = latestTurn.modelResponse;
    if (this.shouldSendToQueue(modelResponse, model)) {
      if (modelResponse == null || modelResponse.text == null) {
        chatTurnsForNewModel.push(latestTurn);
        turnToModelId.set(latestTurn.id as string, model.id as string);
      } else {
        chatTurnsWithExistingModel.push(latestTurn);
      }
    } else {
      this.skippedSxsPairIds.push(sxsPair.id as string);
    }
  }

  private shouldSendToQueue(modelResponse: LoadedModelResponse | null, expectedModel: Model): boolean {
    if (modelResponse == null || modelResponse.text == null) return true;
    return modelResponse.model != null && modelResponse.model.id === expectedModel.id;
  }
}
