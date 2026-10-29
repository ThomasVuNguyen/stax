/** Port of SXSGenerateOutputsStrategyRunOrRerun: (re)run every selected side with the given model. */
import { IllegalInputException } from "../../../lib/errors";
import type { Model } from "../../../entities/Model";
import type { LoadedChat, LoadedChatTurn } from "../service/ChatTurnGraph";
import { type QueueData, getTotalCount, hasChatTurns, newQueueData } from "./QueueData";
import { latestTurnOf } from "./SXSChatDuplicationUtils";
import { SXSGenerateOutputsStrategy } from "./SXSGenerateOutputsStrategy";

export class SXSGenerateOutputsStrategyRunOrRerun extends SXSGenerateOutputsStrategy {
  protected override async validateInputs(): Promise<void> {
    await super.validateInputs();
    if (this.modelA == null && this.modelB == null) throw new IllegalInputException("Model A or Model B is required");
  }

  protected async duplicateChats(): Promise<void> {}

  protected async sendToQueue(): Promise<void> {
    const queueData = await this.collectChatTurnsForQueue();
    if (hasChatTurns(queueData)) {
      const job = await this.createJobStatus(getTotalCount(queueData));
      const isBulk = getTotalCount(queueData) > 10;
      await this.sendNewModelInferences(queueData.chatTurnsForNewModel, queueData.turnToModelId, job, isBulk);
    }
  }

  private async collectChatTurnsForQueue(): Promise<QueueData> {
    const chatTurnsForNewModel: LoadedChatTurn[] = [];
    const turnToModelId = new Map<string, string>();
    const chatTurnsToClear: LoadedChatTurn[] = [];
    for (const sxsPair of this.sxsPairs) {
      if (!this.isPairFailed(sxsPair)) {
        this.processSide(this.modelA, sxsPair.chatA, chatTurnsForNewModel, turnToModelId, chatTurnsToClear);
        this.processSide(this.modelB, sxsPair.chatB, chatTurnsForNewModel, turnToModelId, chatTurnsToClear);
      }
    }
    if (chatTurnsToClear.length) await this.clearModelOutputs(chatTurnsToClear);
    return newQueueData(chatTurnsForNewModel, [], turnToModelId);
  }

  private processSide(
    model: Model | null,
    chat: LoadedChat | null,
    chatTurnsForNewModel: LoadedChatTurn[],
    turnToModelId: Map<string, string>,
    chatTurnsToClear: LoadedChatTurn[],
  ): void {
    if (model == null || chat == null) return;
    const latestTurn = latestTurnOf(chat);
    if (latestTurn.modelResponse != null) chatTurnsToClear.push(latestTurn);
    chatTurnsForNewModel.push(latestTurn);
    turnToModelId.set(latestTurn.id as string, model.id as string);
  }
}
