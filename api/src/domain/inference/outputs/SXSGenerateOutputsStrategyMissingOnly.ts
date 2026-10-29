/** Port of SXSGenerateOutputsStrategyMissingOnly: run only sides whose latest turn has no output. */
import { IllegalInputException } from "../../../lib/errors";
import type { JobStatus } from "../../../entities/JobStatus";
import type { Model } from "../../../entities/Model";
import type { LoadedChat, LoadedChatTurn } from "../service/ChatTurnGraph";
import { type QueueData, getTotalCount, hasChatTurns, newQueueData } from "./QueueData";
import { type LoadedSxsPair, latestTurnOf } from "./SXSChatDuplicationUtils";
import { SXSGenerateOutputsStrategy } from "./SXSGenerateOutputsStrategy";
import * as InferencePublisherService from "../../pubsub/InferencePublisherService";

export class SXSGenerateOutputsStrategyMissingOnly extends SXSGenerateOutputsStrategy {
  protected override async validateInputs(): Promise<void> {
    await super.validateInputs();
    if (this.modelA == null && this.modelB == null) throw new IllegalInputException("Model A or Model B are required");
  }

  protected async duplicateChats(): Promise<void> {}

  protected async sendToQueue(): Promise<void> {
    const queueData = this.collectChatTurnsForQueue();
    if (hasChatTurns(queueData)) {
      const job = await this.createJobStatus(getTotalCount(queueData));
      await this.sendChatTurnsToQueue(queueData, job);
    }
  }

  private collectChatTurnsForQueue(): QueueData {
    const chatTurnsForNewModel: LoadedChatTurn[] = [];
    const turnToModelId = new Map<string, string>();
    for (const sxsPair of this.sxsPairs) {
      if (!this.isPairFailed(sxsPair)) {
        this.processSide(sxsPair, sxsPair.chatA, this.modelA, chatTurnsForNewModel, turnToModelId);
        this.processSide(sxsPair, sxsPair.chatB, this.modelB, chatTurnsForNewModel, turnToModelId);
      }
    }
    return newQueueData(chatTurnsForNewModel, [], turnToModelId);
  }

  private async sendChatTurnsToQueue(queueData: QueueData, job: JobStatus): Promise<void> {
    const isBulk = getTotalCount(queueData) > 10;
    for (const chatTurn of queueData.chatTurnsForNewModel) {
      const dto = this.createInferenceDTO(job, chatTurn);
      await InferencePublisherService.sendInferenceWithModel(
        this.ctx,
        chatTurn,
        dto,
        queueData.turnToModelId.get(chatTurn.id as string) as string,
        false,
        isBulk,
        this.outbox,
      );
    }
  }

  /** processSideA / processSideB. */
  private processSide(
    sxsPair: LoadedSxsPair,
    chat: LoadedChat | null,
    model: Model | null,
    chatTurnsForNewModel: LoadedChatTurn[],
    turnToModelId: Map<string, string>,
  ): void {
    if (model == null) return;
    const latestTurn = latestTurnOf(chat);
    if (latestTurn.modelResponse == null || latestTurn.modelResponse.text == null) {
      chatTurnsForNewModel.push(latestTurn);
      turnToModelId.set(latestTurn.id as string, model.id as string);
    } else {
      this.skippedSxsPairIds.push(sxsPair.id as string);
    }
  }
}
