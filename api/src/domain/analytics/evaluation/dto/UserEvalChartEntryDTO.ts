/** Port of analytics/evaluation/dto/UserEvalChartEntryDTO (camelCase JSON). */
import type { EvalChartDatapointDTO } from "./EvalChartDatapointDTO";
import type { EvalChartEntryVariablesDTO } from "./EvalChartEntryVariablesDTO";
import type { EvalChartMonitoringStatsDTO } from "./EvalChartMonitoringStatsDTO";

export interface UserEvalChartEntryDTO {
  datapoints: EvalChartDatapointDTO[];
  monitoring: EvalChartMonitoringStatsDTO;
  variables: EvalChartEntryVariablesDTO;
  scorerId: string | null;
  scorerName: string | null;
}
