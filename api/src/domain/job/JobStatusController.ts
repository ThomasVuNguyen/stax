/**
 * Port of domain/job/JobStatusController.java: both JobStatusController (`/job`) and
 * ProjectJobStatusController (`/job/projects/{projectId}`), which live in the same Java file.
 * Several of these endpoints are polled by the UI; see JobStatusService / InputStatusService for
 * the query shapes.
 */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { type JobStatusEnum, JobStatusEnumValues } from "../../enums/JobStatusEnum";
import { currentUser } from "../../lib/auth";
import { ctxFromHono } from "../../lib/ctx";
import { IllegalInputException } from "../../lib/errors";
import { queryInt, queryList, rateLimit } from "../../lib/http";
import { assertProjectAccess } from "../../lib/permissions";
import { requiredJsonBody } from "../model/dto/jsonBinding";
import * as InputStatusService from "./InputStatusService";
import * as JobStatusService from "./JobStatusService";
import * as APIResponse from "./dto/APIResponse";
import * as DeleteJobRequest from "./dto/DeleteJobRequest";
import type { JobStatusPage } from "./dto/JobStatusPage";

const app = new Hono<AppEnv>();

function jobStatusPage(c: Parameters<typeof queryInt>[0]): JobStatusPage {
  return { pageIndex: queryInt(c, "pageIndex", 1) as number, pageSize: queryInt(c, "pageSize", 10) as number };
}

// Route order matters where patterns overlap ("/job/status/status", "/job/projects/status"):
// the longer literal pattern is registered first, matching Spring's specificity ordering.

// ---- ProjectJobStatusController (/job/projects/{projectId}) ----

app.get("/job/projects/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const page = jobStatusPage(c);
  const ctx = ctxFromHono(c);
  await assertProjectAccess(ctx, projectId, "read");
  rateLimit(c, "getJobsStatusByProject", 10000, 60);
  return c.json(await JobStatusService.findAllJobStatusByProject(ctx, currentUser(c), projectId, page), 200);
});

// ---- JobStatusController (/job) ----

app.get("/job/status/:jobStatusId", async (c) => {
  rateLimit(c, "getInferenceDetailByJob", 10000, 60);
  return c.json(await JobStatusService.fetchDetailByJob(ctxFromHono(c), c.req.param("jobStatusId"), currentUser(c)), 200);
});

app.get("/job/:jobId/status", async (c) => {
  rateLimit(c, "getJobStatusByJobId", 10000, 60);
  const user = currentUser(c);
  return c.json(await InputStatusService.findAllByJobStatusIdAndUser(ctxFromHono(c), c.req.param("jobId"), user.id), 200);
});

app.get("/job/status", async (c) => {
  const page = jobStatusPage(c);
  rateLimit(c, "getJobsStatus", 10000, 60);
  return c.json(await JobStatusService.findAllJobStatusByUser(ctxFromHono(c), currentUser(c), page), 200);
});

app.delete("/job/status/job/:jobId", async (c) => {
  await JobStatusService.deleteJobStatusByJobId(ctxFromHono(c), c.req.param("jobId"), currentUser(c));
  return c.json(APIResponse.create(true, "Job is successfully deleted.", "job", null), 200);
});

app.delete("/job/status/bulk", async (c) => {
  const request = DeleteJobRequest.fromJson(
    await requiredJsonBody(c, "com.planck.planck.domain.job.dto.DeleteJobRequest"),
  );
  DeleteJobRequest.validate(request);
  const jobsIdSet = new Set(request.job_ids as string[]);
  const count = await JobStatusService.bulkDeleteJobStatusByJobIds(ctxFromHono(c), jobsIdSet, currentUser(c));
  return c.json(APIResponse.create(true, count + " Jobs is successfully deleted.", "jobs", null), 200);
});

// ---- ProjectJobStatusController, continued ----

app.get("/job/projects/:projectId/has-remaining", async (c) => {
  const projectId = c.req.param("projectId");
  const ctx = ctxFromHono(c);
  await assertProjectAccess(ctx, projectId, "read");
  return c.json(await JobStatusService.hasRemainingJobsByProject(ctx, currentUser(c), projectId), 200);
});

app.get("/job/projects/:projectId/ids-by-status", async (c) => {
  const projectId = c.req.param("projectId");
  const raw = queryList(c, "status");
  // List<JobStatusEnum> conversion failure: MethodArgumentTypeMismatchException with a List type.
  if (raw?.some((s) => !(JobStatusEnumValues as string[]).includes(s))) {
    throw new IllegalInputException("Invalid value for parameter 'status'");
  }
  const ctx = ctxFromHono(c);
  await assertProjectAccess(ctx, projectId, "read");
  const statuses = (raw as JobStatusEnum[] | undefined) ?? null;
  return c.json(await JobStatusService.getJobIdsGroupedByStatus(ctx, currentUser(c), projectId, statuses), 200);
});

app.post("/job/projects/:projectId/:jobId/stop", async (c) => {
  const projectId = c.req.param("projectId");
  const ctx = ctxFromHono(c);
  await assertProjectAccess(ctx, projectId, "write");
  await JobStatusService.stopJobStatus(ctx, c.req.param("jobId"), new Date(), projectId);
  return c.json(APIResponse.create(true, "Job successfully stopped.", "job", null), 200);
});

export default app;
