/** Port of analytics/evaluation/dto/UserEvalChartBuilder. */
import type { LLMEvaluator } from "../../../../entities/LLMEvaluator";
import { convertJsonStringToList } from "../../../../util/ObjectMapperUtil";
import * as EvalChartDatapointDTO from "./EvalChartDatapointDTO";
import * as EvalChartEntryVariablesDTO from "./EvalChartEntryVariablesDTO";
import * as EvalChartMonitoringStatsDTO from "./EvalChartMonitoringStatsDTO";
import type { EvaluationAnalyticsRowDTO } from "./EvaluationAnalyticsRowDTO";
import type { UserEvalChartEntryDTO } from "./UserEvalChartEntryDTO";

/** Java `String.valueOf(Double)`: "1.0", "0.25", "1.0E7", "1.0E-4", "null". */
export function javaDoubleToString(v: number | null | undefined): string {
  if (v === null || v === undefined) return "null";
  if (Number.isNaN(v)) return "NaN";
  if (!Number.isFinite(v)) return v > 0 ? "Infinity" : "-Infinity";
  if (v === 0) return Object.is(v, -0) ? "-0.0" : "0.0";
  const abs = Math.abs(v);
  if (abs >= 1e-3 && abs < 1e7) {
    const s = String(v);
    return s.includes(".") ? s : s + ".0";
  }
  const [mantissa, exp] = v.toExponential().split("e");
  return (mantissa.includes(".") ? mantissa : mantissa + ".0") + "E" + Number(exp);
}

interface OutputCategory {
  name?: string | null;
  value?: string | null;
  color?: string | null;
}

export function build(rows: EvaluationAnalyticsRowDTO[], evaluator: LLMEvaluator): UserEvalChartEntryDTO {
  const chart: UserEvalChartEntryDTO = {
    datapoints: [],
    monitoring: EvalChartMonitoringStatsDTO.create(),
    variables: EvalChartEntryVariablesDTO.create(),
    scorerId: null,
    scorerName: null,
  };
  const outputCategories = convertJsonStringToList<OutputCategory>(evaluator.outputCategories) ?? [];
  chart.datapoints.push(
    ...outputCategories.map((cfg) => EvalChartDatapointDTO.create(cfg.name ?? null, cfg.value ?? null, cfg.color ?? null)),
  );

  for (const row of rows) {
    const rowScore = javaDoubleToString(row.score);
    const dp = chart.datapoints.find((d) => d.score === rowScore);
    const rowPromptTokens = row.promptTokens ?? 0;
    const rowCompletionTokens = row.completionTokens ?? 0;
    const rowTimeTaken = row.timeTaken ?? 0;
    if (dp) {
      dp.count++;
      EvalChartDatapointDTO.addPromptTokens(dp, rowPromptTokens);
      EvalChartDatapointDTO.addCompletionTokens(dp, rowCompletionTokens);
      EvalChartDatapointDTO.addTotalLatency(dp, rowTimeTaken);
      EvalChartDatapointDTO.updateAverages(dp);
    } else {
      const meta = chart.variables;
      switch (row.status) {
        case 0:
          meta.pending++;
          break;
        case 2:
          meta.in_progress++;
          break;
        case -1:
          meta.failed++;
          break;
        default:
          meta.unknown++;
      }
    }
    const monitoring = chart.monitoring;
    monitoring.total_prompt_tokens += rowPromptTokens;
    monitoring.total_completion_tokens += rowCompletionTokens;
    monitoring.total_latency += rowTimeTaken;
    monitoring.total_tokens = monitoring.total_prompt_tokens + monitoring.total_completion_tokens;
  }

  const totalCount = chart.datapoints.reduce((n, d) => n + d.count, 0);
  if (totalCount > 0) {
    const stats = chart.monitoring;
    stats.average_prompt_tokens = Math.trunc(stats.total_prompt_tokens / totalCount);
    stats.average_completion_tokens = Math.trunc(stats.total_completion_tokens / totalCount);
    stats.average_latency = stats.total_latency / totalCount;
  }
  return chart;
}
