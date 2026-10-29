/**
 * Port of monitoringapp/notifications/UserDeletionNotificationService. The @Primary
 * implementation (GCPMonitoringUserDeletionNotificationService) published the custom metric
 * `custom.googleapis.com/user_deletion/stale_requests_count`; GmailNotificationService was unused.
 * Neither Cloud Monitoring client libraries nor Gmail are available on Workers, so this only emits
 * a structured log line (queryable/alertable in Workers Logs).
 */
import type { UserDeletionStatus } from "../../../entities/UserDeletionStatus";

const METRIC_TYPE = "custom.googleapis.com/user_deletion/stale_requests_count";

export async function sendStaleUserDeletionNotification(staleUserDeletions: UserDeletionStatus[] | null): Promise<void> {
  const staleCount = staleUserDeletions?.length ?? 0;
  console.info(
    JSON.stringify({
      message: `Publishing metric for ${staleCount} stale user deletions (log only)`,
      metric: METRIC_TYPE,
      value: staleCount,
      requestIds: staleUserDeletions?.map((s) => s.requestId) ?? [],
    }),
  );
}
