/** Port of domain/project/ProjectController (`/projects`). */
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../../env";
import { ctxFromHono, requireUser } from "../../lib/ctx";
import { RuntimeException } from "../../lib/errors";
import { jsonBody, queryEnum, queryInt } from "../../lib/http";
import { ChatTurnContainerType } from "../../enums/ChatTurnContainerType";
import { EvaluationTypeValues } from "../../enums/EvaluationType";
import * as ChatExportService from "../importexport/ChatExportService";
import * as ChatImportService from "../importexport/ChatImportService";
import type { ChatImportRequest } from "../importexport/dto/ChatImportRequest";
import * as EvaluationContainerService from "./EvaluationContainerService";
import * as ProjectDTO from "./dto/ProjectDTO";
import * as ProjectService from "./ProjectService";
import * as SampleProjectService from "./SampleProjectService";

const app = new Hono<AppEnv>();

/** `new ImportResultDTO()` as Jackson serialised it. */
const EMPTY_IMPORT_RESULT = { totalRows: 0, successfulRows: 0, failedRows: 0, errorMessages: [] as string[] };

/**
 * Spring 6.1 built-in method validation of @Min/@Max request params raised
 * HandlerMethodValidationException, which only the catch-all handler matched (500 with its
 * message). A plain Error reaches the same fallback in lib/errors onError.
 */
const methodValidationFailure = () => new Error('400 BAD_REQUEST "Validation failure"');

// @PostConstruct SampleProjectServiceImpl.initiateSampleProjectForDefaultAuth: no startup hook on
// Workers, so it runs once per isolate on the first /projects request (no-op with auth enabled).
async function ensureDefaultSampleProject(c: Context<AppEnv>, next: () => Promise<void>) {
  try {
    await SampleProjectService.initiateSampleProjectForDefaultAuth(ctxFromHono(c));
  } catch (e) {
    console.error("Failed to create the sample project for the default user", e);
  }
  await next();
}
app.use("/projects", ensureDefaultSampleProject);
app.use("/projects/*", ensureDefaultSampleProject);

async function listProjects(c: Context<AppEnv>) {
  const ctx = ctxFromHono(c);
  const pageSize = queryInt(c, "page_size", 10) as number;
  const pageNumber = queryInt(c, "page_number", 0) as number;
  const type = queryEnum(c, "type", EvaluationTypeValues) ?? null;
  const include = c.req.query("include") ?? null;
  if (pageSize < 1 || pageSize > 200 || pageNumber < 0) throw methodValidationFailure();
  return c.json(
    await ProjectService.getAllProjectsSortedByIsDefaultAndUpdatedAt(ctx, requireUser(ctx), pageSize, pageNumber, type, include),
    200,
  );
}
app.get("/projects", listProjects);
app.get("/projects/", listProjects);

async function createProject(c: Context<AppEnv>) {
  const ctx = ctxFromHono(c);
  // @Validated(CreateProject.class): no ProjectDTO constraint belongs to that group.
  const body = await jsonBody<ProjectDTO.ProjectDTO>(c);
  const command = {
    projectId: body.project_id ?? null,
    name: body.name ?? null,
    description: body.description ?? null,
    isDefaultProject: false,
    // Field initializer EvaluationType.POINTWISE applies when "type" is absent.
    type: body.type === undefined ? "POINTWISE" : body.type,
  } as const;
  validateEvaluationType(command.type);
  return c.json(await ProjectService.createProject(ctx, requireUser(ctx), command), 200);
}
app.post("/projects", createProject);
app.post("/projects/", createProject);

function validateEvaluationType(type: unknown) {
  if (type != null && !(EvaluationTypeValues as readonly unknown[]).includes(type)) {
    // HttpMessageNotReadableException → catch-all handler (500).
    throw new Error(
      `JSON parse error: Cannot deserialize value of type \`com.planck.planck.enums.EvaluationType\` from String "${String(type)}": not one of the values accepted for Enum class: [${EvaluationTypeValues.join(", ")}]`,
    );
  }
}

app.get("/projects/:projectId/export", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ChatExportService.exportAllChats(ctx, c.req.param("projectId"), requireUser(ctx)), 200);
});

app.get("/projects/:projectId/metrics-summary", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ProjectService.getProjectInferenceMonitoringSummary(ctx, requireUser(ctx), c.req.param("projectId")), 200);
});

app.post("/projects/:projectId/import", async (c) => {
  const ctx = ctxFromHono(c);
  const user = requireUser(ctx);
  const projectId = c.req.param("projectId");
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const file = (form as Record<string, unknown>)["file"];
  if (!(file instanceof File)) {
    // MissingServletRequestPartException → catch-all handler (500).
    throw new Error("Required part 'file' is not present.");
  }
  // @RequestParam values may come from the query string or the multipart form.
  const param = (name: string): string | null => {
    const q = c.req.query(name);
    if (q !== undefined) return q;
    const f = (form as Record<string, unknown>)[name];
    return typeof f === "string" ? f : null;
  };
  if (file.size === 0) return c.json(EMPTY_IMPORT_RESULT, 400);

  const variablesColumnNamesCsv = param("variables_column_names");
  let variablesColumnNames: string[] = [];
  if (variablesColumnNamesCsv != null && variablesColumnNamesCsv.trim() !== "") {
    variablesColumnNames = variablesColumnNamesCsv.split(/\s*,\s*/);
    // String.split drops trailing empty strings.
    while (variablesColumnNames.length && variablesColumnNames[variablesColumnNames.length - 1] === "") {
      variablesColumnNames.pop();
    }
  }
  if (variablesColumnNames.length > 10) {
    // java.lang.IllegalArgumentException → RuntimeException handler (500 RUNTIME_ERROR).
    throw new RuntimeException("The number of variables columns cannot exceed 10.");
  }

  try {
    const importRequest = {
      file,
      user,
      sourceType: ChatTurnContainerType.PROJECT,
      sourceId: projectId,
      chatColumnName: param("chat_column_name"),
      metadataColumnNames: variablesColumnNames,
      inputColumnName: param("input_column_name"),
      outputColumnName: param("output_column_name"),
      expectedOutputColumnName: param("expected_output_name"),
      tagsColumnName: param("tags_column_name"),
      systemInstructionColumnName: param("system_instruction_column_name"),
      modelLabelColumnName: param("model_label_column_name"),
      humanEvalScoreColumnName: param("human_eval_score_column_name"),
      humanEvalNotesColumnName: param("human_eval_score_notes_column_name"),
      inferenceAnalyticsColumnName: param("inference_analytics_column_name"),
      llmEvaluationsColumnName: param("llm_evaluations_column_name"),
    } as ChatImportRequest;
    return c.json(await ChatImportService.importChatsFromFile(ctx, importRequest), 200);
  } catch (e) {
    console.error("Chat import failed", e);
    return c.json(EMPTY_IMPORT_RESULT, 400);
  }
});

app.get("/projects/:projectId/human-eval-pass-rate", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ProjectService.getHumanEvalMetrics(ctx, requireUser(ctx), c.req.param("projectId")), 200);
});

app.get("/projects/:projectId/eval-analytics/:scorerId", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(
    await ProjectService.getProjectEvaluationAnalyticsByScorer(
      ctx,
      requireUser(ctx),
      c.req.param("projectId"),
      c.req.param("scorerId"),
    ),
    200,
  );
});

app.get("/projects/:projectId/eval-analytics", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ProjectService.getProjectEvaluationAnalyticsForAllScorers(ctx, requireUser(ctx), c.req.param("projectId")), 200);
});

app.get("/projects/:projectId", async (c) => {
  const ctx = ctxFromHono(c);
  return c.json(await ProjectService.getProject(ctx, requireUser(ctx), c.req.param("projectId"), c.req.query("include") ?? null), 200);
});

app.delete("/projects/:projectId", async (c) => {
  const ctx = ctxFromHono(c);
  const projectId = c.req.param("projectId");
  await EvaluationContainerService.deleteContainer(ctx, requireUser(ctx), projectId);
  return c.json({ message: projectId + " was deleted successfully" }, 200);
});

app.patch("/projects/:projectId", async (c) => {
  const ctx = ctxFromHono(c);
  const body = await jsonBody<ProjectDTO.ProjectDTO>(c);
  validateEvaluationType(body.type);
  ProjectDTO.validate(body);
  const command = { name: body.name ?? null, description: body.description ?? null };
  return c.json(await ProjectService.updateProjectIgnoreOutputOnlyFields(ctx, c.req.param("projectId"), command, requireUser(ctx)), 200);
});

export default app;
