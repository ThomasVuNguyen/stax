export const ChatTurnContainerType = {
  PROJECT: "PROJECT",
  DATASET: "DATASET",
} as const;
export type ChatTurnContainerType = (typeof ChatTurnContainerType)[keyof typeof ChatTurnContainerType];

/** Declaration order (`ChatTurnContainerType.values()`). */
export const ChatTurnContainerTypeValues: ChatTurnContainerType[] = [ChatTurnContainerType.PROJECT, ChatTurnContainerType.DATASET];
