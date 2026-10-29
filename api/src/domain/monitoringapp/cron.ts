/** @Scheduled(cron = "0 0 9,21 * * ?") MonitoringSchedulerServiceImpl.scheduledMonitoring (wrangler `triggers.crons`). */
import type { Env } from "../../env";
import { ctxFromJob } from "../../lib/ctx";
import * as MonitoringSchedulerService from "./MonitoringSchedulerService";

export async function scheduled(env: Env, exec: ExecutionContext): Promise<void> {
  await MonitoringSchedulerService.scheduledMonitoring(ctxFromJob(env, exec));
}
