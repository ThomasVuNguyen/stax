/**
 * Port of analytics/evaluation/dto/UserEvalMonitoringParams (bound from query params).
 * `new UserEvalMonitoringParams()` → `create()`: startTime = now - 15 days, endTime = now.
 * Instants are Date objects (ISO strings are accepted by the repository too).
 */
export interface UserEvalMonitoringParams {
  startTime: Date | string | null;
  endTime: Date | string | null;
  projectId: string | null;
  scorerNames: string[] | null;
  scorerIds: string[] | null;
  tagIds: string[] | null;
  modelIds: string[] | null;
  /** @Deprecated */
  tagNames: string[] | null;
  /** @Deprecated */
  evalModelNames: string[] | null;
  /** @Deprecated */
  evalModelVersions: string[] | null;
  /** "chatTurnA" / "chatTurnB" restricts scores to one side of the project's SxS pairs. */
  sxsJoinColumnName: string | null;
}

const FIFTEEN_DAYS_MS = 15 * 24 * 3600 * 1000;

export function create(init: Partial<UserEvalMonitoringParams> = {}): UserEvalMonitoringParams {
  const now = Date.now();
  return {
    startTime: new Date(now - FIFTEEN_DAYS_MS),
    endTime: new Date(now),
    projectId: null,
    scorerNames: null,
    scorerIds: null,
    tagIds: null,
    modelIds: null,
    tagNames: null,
    evalModelNames: null,
    evalModelVersions: null,
    sxsJoinColumnName: null,
    ...init,
  };
}
