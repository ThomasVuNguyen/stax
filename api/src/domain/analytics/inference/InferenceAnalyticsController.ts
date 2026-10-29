/**
 * Port of analytics/inference/InferenceAnalyticsController.
 * ResponseStatusException is a RuntimeException, so the Java handler rendered it as
 * 500 RUNTIME_ERROR with the message `400 BAD_REQUEST "<reason>"`; that is kept.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../../../env";
import { currentUser } from "../../../lib/auth";
import { ctxFromHono } from "../../../lib/ctx";
import { IllegalInputException, RuntimeException } from "../../../lib/errors";
import { queryEnum, queryList } from "../../../lib/http";
import { type AggregationWindow, fromValue as aggregationWindowFromValue } from "../../../enums/AggregationWindow";
import { ModelProviderValues } from "../../../enums/ModelProvider";
import { parseInstant } from "../InstantParam";
import * as InferenceAnalyticsService from "./InferenceAnalyticsService";
import * as TimeSeriesAnalyticsResponseDTO from "./dto/TimeSeriesAnalyticsResponseDTO";

const app = new Hono<AppEnv>();
const FIFTEEN_DAYS_MS = 15 * 24 * 3600 * 1000;

function instantParam(c: Context<AppEnv>, name: string): Date | null {
  const v = c.req.query(name);
  if (v === undefined || v.trim() === "") return null;
  const d = parseInstant(v.trim());
  if (!d) throw new IllegalInputException(`Invalid value for parameter '${name}'`);
  return d;
}

function badRequest(reason: string): RuntimeException {
  return new RuntimeException(`400 BAD_REQUEST "${reason}"`);
}

app.get("/analytics/inference-monitoring", async (c) => {
  const ctx = ctxFromHono(c);
  const user = currentUser(c);
  const modelId = c.req.query("modelId") ?? null;
  const projectId = c.req.query("projectId") ?? null;
  const modelProvider = queryEnum(c, "modelProvider", ModelProviderValues) ?? null;
  const startTime = instantParam(c, "start_time");
  const endTime = instantParam(c, "end_time");
  const aggregateWindow = c.req.query("aggregateWindow");
  const tagIds = queryList(c, "tagIds") ?? null;

  let effectiveStartTime = startTime;
  let effectiveEndTime = endTime;
  const now = new Date();
  if (effectiveStartTime == null && effectiveEndTime == null) {
    effectiveEndTime = now;
    effectiveStartTime = new Date(now.getTime() - FIFTEEN_DAYS_MS);
  } else if (effectiveStartTime == null) {
    effectiveStartTime = new Date(effectiveEndTime!.getTime() - FIFTEEN_DAYS_MS);
  } else if (effectiveEndTime == null) {
    effectiveEndTime = now;
  }

  let windowEnum: AggregationWindow | null = null;
  if (aggregateWindow != null && aggregateWindow.trim() !== "") {
    try {
      windowEnum = aggregationWindowFromValue(aggregateWindow);
    } catch {
      throw badRequest("Invalid aggregation_window value: " + aggregateWindow);
    }
  }

  // A future end time is clamped to now; a start time defaulted from it is recomputed.
  if (effectiveEndTime!.getTime() > now.getTime()) {
    effectiveEndTime = now;
    if (startTime == null && endTime != null) {
      effectiveStartTime = new Date(effectiveEndTime.getTime() - FIFTEEN_DAYS_MS);
    }
  }
  if (effectiveStartTime!.getTime() > effectiveEndTime!.getTime()) {
    throw badRequest("start_time cannot be after end_time.");
  }

  const analytics = await InferenceAnalyticsService.getInferenceTimeSeriesAnalytics(
    ctx,
    modelId,
    user,
    projectId,
    modelProvider,
    effectiveStartTime!,
    effectiveEndTime!,
    windowEnum,
    tagIds,
  );
  return c.json(TimeSeriesAnalyticsResponseDTO.fromTimeSeries(analytics));
});

export default app;
