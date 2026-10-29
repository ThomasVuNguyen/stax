/**
 * Port of monitoringapp/MonitoringSchedulerService + MonitoringSchedulerServiceImpl. Java ran it
 * in a separate "monitoring" deployment at startup (@PostConstruct) and on the
 * `monitoring.schedule.cron` schedule (09:00 and 21:00); here only the cron trigger runs it (cron.ts).
 */
import type { Ctx } from "../../lib/ctx";
import * as UserDeletionMonitoringService from "./UserDeletionMonitoringService";

export async function initialize(ctx: Ctx): Promise<void> {
  console.info("Running initial stale user deletion checks on startup...");
  await runStaleUserDeletionCheck(ctx);
  await runStaleUserDeletionRetry(ctx);
  console.info("Initial stale user deletion checks completed");
}

export async function scheduledMonitoring(ctx: Ctx): Promise<void> {
  console.info("Starting scheduled monitoring tasks...");
  await runStaleUserDeletionCheck(ctx);
  await runStaleUserDeletionRetry(ctx);
  console.info("Scheduled monitoring tasks completed");
}

async function runStaleUserDeletionCheck(ctx: Ctx): Promise<void> {
  try {
    await UserDeletionMonitoringService.checkForStaleUserDeletions(ctx);
  } catch (e) {
    console.error("Error during stale user deletion check", e);
  }
}

async function runStaleUserDeletionRetry(ctx: Ctx): Promise<void> {
  try {
    await UserDeletionMonitoringService.retryStaleUserDeletions(ctx);
  } catch (e) {
    console.error("Error during stale user deletion retry", e);
  }
}
