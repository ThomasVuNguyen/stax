/**
 * @ChatTurnFetcherFor(ChatTurnContainerType) was a Spring stereotype marking the bean that fetches
 * chat turns for a container type (PROJECT / DATASET); a registry collected the annotated beans at
 * startup. Workers have no component scanning, so the owner of the chat-turn fetchers keeps an
 * explicit `Record<ChatTurnContainerType, fetcher>` map next to the fetchers instead. Nothing to
 * export here.
 */
export {};
