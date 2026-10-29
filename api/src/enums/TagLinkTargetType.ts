export const TagLinkTargetType = {
  CHAT_TURN: "CHAT_TURN",
  CHAT: "CHAT",
  INFERENCE_MONITORING: "INFERENCE_MONITORING",
  EVALUATION_MONITORING: "EVALUATION_MONITORING",
} as const;
export type TagLinkTargetType = (typeof TagLinkTargetType)[keyof typeof TagLinkTargetType];

/** Declaration order (`TagLinkTargetType.values()`). */
export const TagLinkTargetTypeValues: TagLinkTargetType[] = [TagLinkTargetType.CHAT_TURN, TagLinkTargetType.CHAT, TagLinkTargetType.INFERENCE_MONITORING, TagLinkTargetType.EVALUATION_MONITORING];
