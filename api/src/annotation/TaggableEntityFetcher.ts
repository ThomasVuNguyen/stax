/**
 * @TaggableEntityFetcher(TagLinkTargetType) was a Spring stereotype marking the bean that loads
 * taggable entities for a tag link target type (CHAT_TURN, CHAT, INFERENCE_MONITORING,
 * EVALUATION_MONITORING); the tags service discovered them by annotation. On Workers the tags
 * package keeps an explicit `Record<TagLinkTargetType, fetcher>` map instead. Nothing to export.
 */
export {};
