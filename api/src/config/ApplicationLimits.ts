/**
 * Port of config/ApplicationLimits. application.yaml defines none of these properties, so the
 * `@Value` defaults are what the server used.
 */
export const ApplicationLimits = Object.freeze({
  maxUserTags: 200,
  maxChatsPerProject: 10_000,
  maxChatsPerDataSet: 10_000,
  maxTagsPerEntity: 5,
  maxDataSets: 200,
  maxVariableKeysPerChat: 10,
});

export const getMaxUserTags = () => ApplicationLimits.maxUserTags;
export const getMaxChatsPerProject = () => ApplicationLimits.maxChatsPerProject;
export const getMaxChatsPerDataSet = () => ApplicationLimits.maxChatsPerDataSet;
export const getMaxTagsPerEntity = () => ApplicationLimits.maxTagsPerEntity;
export const getMaxDataSets = () => ApplicationLimits.maxDataSets;
export const getMaxVariableKeysPerChat = () => ApplicationLimits.maxVariableKeysPerChat;
