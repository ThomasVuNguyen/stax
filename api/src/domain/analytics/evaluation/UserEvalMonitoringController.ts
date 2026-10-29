/**
 * Port of analytics/evaluation/UserEvalMonitoringController. UserEvalMonitoringParams is bound
 * from the query string (@ModelAttribute) and validated with @ValidTimeRange.
 */
import { Hono, type Context } from "hono";
import type { AppEnv } from "../../../env";
import { currentUser } from "../../../lib/auth";
import { ctxFromHono } from "../../../lib/ctx";
import { InvalidDataException } from "../../../lib/errors";
import { queryList } from "../../../lib/http";
import { validateTimeRange } from "../../../annotation/ValidTimeRange";
import { parseInstant } from "../InstantParam";
import * as UserEvalMonitoringParams from "./dto/UserEvalMonitoringParams";
import * as UserEvalMonitoringService from "./UserEvalMonitoringService";

const app = new Hono<AppEnv>();

/** Spring data binding: a param that is absent keeps the field default; "" binds null. */
function bindInstant(c: Context<AppEnv>, name: "startTime" | "endTime", fallback: Date | string | null) {
  const v = c.req.query(name);
  if (v === undefined) return fallback;
  if (v.trim() === "") return null;
  const d = parseInstant(v);
  if (!d) {
    throw new InvalidDataException(
      `${name}: Failed to convert property value of type 'java.lang.String' to required type 'java.time.Instant' for property '${name}'`,
    );
  }
  return d;
}

app.get("/analytics/user-eval-monitoring", async (c) => {
  const ctx = ctxFromHono(c);
  const defaults = UserEvalMonitoringParams.create();
  const str = (name: string) => {
    const v = c.req.query(name);
    return v === undefined || v === "" ? null : v;
  };
  const params = UserEvalMonitoringParams.create({
    startTime: bindInstant(c, "startTime", defaults.startTime),
    endTime: bindInstant(c, "endTime", defaults.endTime),
    projectId: str("projectId"),
    scorerNames: queryList(c, "scorerNames") ?? null,
    scorerIds: queryList(c, "scorerIds") ?? null,
    tagIds: queryList(c, "tagIds") ?? null,
    modelIds: queryList(c, "modelIds") ?? null,
    tagNames: queryList(c, "tagNames") ?? null,
    evalModelNames: queryList(c, "evalModelNames") ?? null,
    evalModelVersions: queryList(c, "evalModelVersions") ?? null,
    sxsJoinColumnName: str("sxsJoinColumnName"),
  });
  validateTimeRange(params, "userEvalMonitoringParams");
  return c.json(await UserEvalMonitoringService.getAnalyticsMonitoringData(ctx, currentUser(c), params));
});

export default app;
