/**
 * Port of domain/inferencemonitoring/InferenceMonitoringRepositoryCustom +
 * InferenceMonitoringRepositoryImpl (no separate Impl file). Re-exported by
 * InferenceMonitoringRepository.ts.
 *
 * getAnalyticsTimeSeries: aggregates inference_monitoring rows into time windows and pads empty
 * windows with zero rows. Translation notes:
 * - The Java code had MySQL (production) and SQLite branches; this follows the MySQL semantics on
 *   ISO-8601 text timestamps (UTC). WEEKLY windows start on Monday (MySQL YEARWEEK mode 1 and the
 *   Java padding logic); the old Java SQLite branch used Sunday, which never matched the padding.
 * - Window labels are parsed as UTC; only windows produced by the padding generator are returned
 *   (as in Java, where unmatched SQL windows were dropped by the padding map lookup).
 * - Dates are accepted as `Date` or ISO strings (Java `Instant`).
 */
import { all, placeholders, type Param } from "../../lib/db";
import { IllegalArgumentException } from "../../lib/errors";
import { AggregationWindow } from "../../enums/AggregationWindow";
import type { ModelProvider } from "../../enums/ModelProvider";
import type { TimeSeriesAnalyticsDTO } from "../analytics/inference/dto/TimeSeriesAnalyticsDTO";

type InstantLike = Date | string | number;

function toDate(v: InstantLike): Date {
  return v instanceof Date ? v : new Date(v);
}

/** SQLite expression producing the window label for `im.created_at` (ISO text). */
function windowStartExpression(window: AggregationWindow): string {
  const c = "im.created_at";
  switch (window) {
    case AggregationWindow.PER_SECOND:
      return `strftime('%Y-%m-%d %H:%M:%S', ${c})`;
    case AggregationWindow.PER_15_SECONDS:
      return `datetime((CAST(strftime('%s', ${c}) AS INTEGER) / 15) * 15, 'unixepoch')`;
    case AggregationWindow.PER_MINUTE:
      return `strftime('%Y-%m-%d %H:%M:00', ${c})`;
    case AggregationWindow.HOURLY:
      return `strftime('%Y-%m-%d %H:00:00', ${c})`;
    case AggregationWindow.WEEKLY:
      // Monday on or before the date.
      return `date(${c}, '-6 days', 'weekday 1')`;
    case AggregationWindow.MONTHLY:
      return `strftime('%Y-%m-01', ${c})`;
    case AggregationWindow.DAILY:
    default:
      return `date(${c})`;
  }
}

/** Parses "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" as UTC epoch millis (null when unparseable). */
function parseWindowLabel(label: unknown): number | null {
  if (label === null || label === undefined) return null;
  const s = String(label);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

/** `@JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss'Z'", timezone = "UTC")` */
function formatWindowStart(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function truncateToWindowStart(ms: number, window: AggregationWindow): number {
  const d = new Date(ms);
  switch (window) {
    case AggregationWindow.PER_SECOND:
      return Math.floor(ms / 1000) * 1000;
    case AggregationWindow.PER_15_SECONDS:
      return Math.floor(Math.floor(ms / 1000) / 15) * 15 * 1000;
    case AggregationWindow.PER_MINUTE:
      return Math.floor(ms / 60_000) * 60_000;
    case AggregationWindow.HOURLY:
      return Math.floor(ms / 3_600_000) * 3_600_000;
    case AggregationWindow.DAILY:
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    case AggregationWindow.WEEKLY: {
      const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const sinceMonday = (d.getUTCDay() + 6) % 7;
      return day - sinceMonday * 86_400_000;
    }
    case AggregationWindow.MONTHLY:
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    default:
      return ms;
  }
}

function incrementWindow(ms: number, window: AggregationWindow): number {
  switch (window) {
    case AggregationWindow.PER_SECOND:
      return ms + 1000;
    case AggregationWindow.PER_15_SECONDS:
      return ms + 15_000;
    case AggregationWindow.PER_MINUTE:
      return ms + 60_000;
    case AggregationWindow.HOURLY:
      return ms + 3_600_000;
    case AggregationWindow.DAILY:
      return ms + 86_400_000;
    case AggregationWindow.WEEKLY:
      return ms + 7 * 86_400_000;
    case AggregationWindow.MONTHLY: {
      const d = new Date(ms);
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
    }
    default:
      return ms + 1;
  }
}

function generateExpectedWindowInstants(start: number, end: number, window: AggregationWindow): number[] {
  const out: number[] = [];
  if (start > end) return out;
  let cur = truncateToWindowStart(start, window);
  while (cur <= end) {
    out.push(cur);
    cur = incrementWindow(cur, window);
    if (window === AggregationWindow.PER_SECOND && out.length > 1_000_000) {
      console.warn("Reached excessive number of instants for PER_SECOND window. Stopping generation.");
      break;
    }
  }
  return out;
}

interface RawRow {
  window_start: unknown;
  cnt: number | null;
  sum_turn_time: number | null;
  avg_turn_time: number | null;
  sum_prompt: number | null;
  sum_completion: number | null;
  sum_total: number | null;
  avg_chat_latency: number | null;
  sum_chat_prompt: number | null;
  sum_chat_completion: number | null;
  sum_chat_total: number | null;
}

function toLong(v: unknown): number {
  return v === null || v === undefined ? 0 : Math.trunc(Number(v));
}

function toDouble(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}

/** Java `new TimeSeriesAnalyticsDTO(Timestamp, …)` (nulls → 0). */
function toDto(ms: number, r: RawRow | null): TimeSeriesAnalyticsDTO {
  return {
    windowStart: formatWindowStart(ms),
    windowStartEpochMillis: ms,
    totalInferences: toLong(r?.cnt),
    total_turn_time_taken: toDouble(r?.sum_turn_time),
    average_turn_time_taken: toDouble(r?.avg_turn_time),
    total_turn_prompt_tokens: toLong(r?.sum_prompt),
    total_turn_completion_tokens: toLong(r?.sum_completion),
    total_turn_total_tokens: toLong(r?.sum_total),
    average_avg_chat_latency: toDouble(r?.avg_chat_latency),
    total_chat_prompt_tokens: toLong(r?.sum_chat_prompt),
    total_chat_completion_tokens: toLong(r?.sum_chat_completion),
    total_chat_total_tokens: toLong(r?.sum_chat_total),
  };
}

/**
 * Time-series aggregation of inference monitoring. Optional filters: modelId, userId, projectId
 * (container), modelProvider and tagIds (a row must carry ALL given tags via tag_link with
 * target_type INFERENCE_MONITORING). Range: created_at >= startDate and < endDate + 1ms.
 */
export async function getAnalyticsTimeSeries(
  db: D1Database,
  modelId: string | null | undefined,
  userId: string | null | undefined,
  projectId: string | null | undefined,
  modelProvider: ModelProvider | null | undefined,
  startDate: InstantLike | null | undefined,
  endDate: InstantLike | null | undefined,
  window: AggregationWindow,
  tagIds: string[] | null | undefined,
): Promise<TimeSeriesAnalyticsDTO[]> {
  if (startDate == null || endDate == null) {
    throw new IllegalArgumentException("Start date and end date cannot be null.");
  }
  const start = toDate(startDate).getTime();
  const end = toDate(endDate).getTime();
  if (start > end) throw new IllegalArgumentException("Start date cannot be after end date.");

  const params: Param[] = [new Date(start).toISOString(), new Date(end + 1).toISOString()];
  let where = "WHERE im.created_at >= ? AND im.created_at < ? ";
  if (modelId && modelId.trim()) {
    where += "AND im.model_id = ? ";
    params.push(modelId);
  }
  if (userId && userId.trim()) {
    where += "AND im.user_id = ? ";
    params.push(userId);
  }
  if (projectId && projectId.trim()) {
    where += "AND im.container_id = ? ";
    params.push(projectId);
  }
  if (modelProvider != null) {
    where += "AND im.model_provider = ? ";
    params.push(modelProvider);
  }
  if (tagIds && tagIds.length) {
    where +=
      "AND (SELECT COUNT(DISTINCT tl.tag_id) FROM tag_link tl WHERE tl.target_id = im.id " +
      `AND tl.target_type = 'INFERENCE_MONITORING' AND tl.tag_id IN ${placeholders(tagIds.length)}) >= ? `;
    params.push(...tagIds, tagIds.length);
  }

  const sql =
    `SELECT ${windowStartExpression(window)} AS window_start,
       COUNT(im.id) AS cnt,
       SUM(im.turn_time_taken) AS sum_turn_time,
       AVG(im.turn_time_taken) AS avg_turn_time,
       SUM(im.turn_prompt_tokens) AS sum_prompt,
       SUM(im.turn_completion_tokens) AS sum_completion,
       SUM(im.turn_total_tokens) AS sum_total,
       AVG(im.avg_chat_latency) AS avg_chat_latency,
       SUM(im.chat_total_prompt_tokens) AS sum_chat_prompt,
       SUM(im.chat_total_completion_tokens) AS sum_chat_completion,
       SUM(im.chat_total_tokens) AS sum_chat_total
     FROM inference_monitoring im ` +
    where +
    "GROUP BY window_start ORDER BY window_start ASC";

  const rows = await all<RawRow>(db, sql, ...params);

  // Keep the first row per window (Java toMap merge keeps the first).
  const actual = new Map<number, RawRow>();
  for (const r of rows) {
    const ms = parseWindowLabel(r.window_start);
    if (ms === null) {
      console.error("Could not determine windowStart Timestamp for row.");
      continue;
    }
    if (!actual.has(ms)) actual.set(ms, r);
  }

  return generateExpectedWindowInstants(start, end, window).map((ms) => toDto(ms, actual.get(ms) ?? null));
}
