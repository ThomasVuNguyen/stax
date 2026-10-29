import type { LoadedChatTurn } from "../service/ChatTurnGraph";

/** Port of domain/inference/outputs/QueueData (@Value). */
export interface QueueData {
  chatTurnsForNewModel: LoadedChatTurn[];
  chatTurnsWithExistingModel: LoadedChatTurn[];
  turnToModelId: Map<string, string>;
}

export function newQueueData(
  chatTurnsForNewModel: LoadedChatTurn[],
  chatTurnsWithExistingModel: LoadedChatTurn[],
  turnToModelId: Map<string, string>,
): QueueData {
  return { chatTurnsForNewModel, chatTurnsWithExistingModel, turnToModelId };
}

export function getTotalCount(q: QueueData): number {
  return q.chatTurnsForNewModel.length + q.chatTurnsWithExistingModel.length;
}

export function hasChatTurns(q: QueueData): boolean {
  return getTotalCount(q) > 0;
}
