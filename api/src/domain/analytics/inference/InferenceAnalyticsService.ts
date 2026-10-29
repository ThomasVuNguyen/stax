/** Port of analytics/inference/InferenceAnalyticsService + InferenceAnalyticsServiceImpl. */
import type { Ctx } from "../../../lib/ctx";
import { AggregationWindow } from "../../../enums/AggregationWindow";
import type { ModelProvider } from "../../../enums/ModelProvider";
import * as InferenceMonitoringRepository from "../../inferencemonitoring/InferenceMonitoringRepository";
import type { TimeSeriesAnalyticsDTO } from "./dto/TimeSeriesAnalyticsDTO";

export async function getInferenceTimeSeriesAnalytics(
  ctx: Ctx,
  modelId: string | null,
  user: { id: string | null },
  projectId: string | null,
  modelProvider: ModelProvider | null,
  startTime: Date,
  endTime: Date,
  window: AggregationWindow | null,
  tagIds: string[] | null,
): Promise<TimeSeriesAnalyticsDTO[]> {
  const effectiveWindow = determineEffectiveAggregationWindow(window, startTime, endTime);
  return InferenceMonitoringRepository.getAnalyticsTimeSeries(
    ctx.db,
    modelId,
    user.id,
    projectId,
    modelProvider,
    startTime,
    endTime,
    effectiveWindow,
    tagIds,
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** User-specified window wins; otherwise derived from the range duration. */
function determineEffectiveAggregationWindow(
  initialWindow: AggregationWindow | null,
  startTime: Date,
  endTime: Date,
): AggregationWindow {
  if (initialWindow != null) return initialWindow;
  const duration = endTime.getTime() - startTime.getTime();
  if (duration <= 0) return AggregationWindow.DAILY;
  if (duration <= 15 * MINUTE) return AggregationWindow.PER_SECOND;
  if (duration <= 6 * HOUR) return AggregationWindow.PER_MINUTE;
  if (duration <= 2 * DAY) return AggregationWindow.HOURLY;
  if (duration <= 30 * DAY) return AggregationWindow.DAILY;
  if (duration <= 90 * DAY) return AggregationWindow.WEEKLY;
  return AggregationWindow.MONTHLY;
}
