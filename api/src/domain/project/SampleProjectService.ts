/**
 * Port of domain/project/SampleProjectService(+Impl).
 *
 * - `createSampleProjectForUser(ctx, user)`: the user is explicit (sign-up runs before the request
 *   has a principal); downstream services get a ctx whose `user` is that user.
 * - The sample CSV (classpath resource `sample-data.csv`) is embedded in `sampleData.ts`. The
 *   `sample.*` properties were never overridden in application.yaml, so their defaults are
 *   constants here.
 * - `@PostConstruct initiateSampleProjectForDefaultAuth()`: Workers have no startup hook, so
 *   ProjectController runs `initiateSampleProjectForDefaultAuth(ctx)` once per isolate on the first
 *   /projects request when auth is disabled.
 */
import type { Ctx } from "../../lib/ctx";
import type { AuthUser } from "../../lib/auth";
import { authEnabled, findUserByEmail } from "../../lib/auth";
import * as ProjectEntity from "../../entities/Project";
import { ChatTurnContainerType } from "../../enums/ChatTurnContainerType";
import * as PointwiseHeuristicEvaluatorService from "../evaluator/heuristic/service/PointwiseHeuristicEvaluatorService";
import * as HumanEvaluatorService from "../evaluator/human/service/HumanEvaluatorService";
import * as ChatImportService from "../importexport/ChatImportService";
import type { ChatImportRequest } from "../importexport/dto/ChatImportRequest";
import type { ImportResultDTO } from "../importexport/dto/ImportResultDTO";
import * as ProjectDTO from "./dto/ProjectDTO";
import * as ProjectRepository from "./ProjectRepository";
import { SAMPLE_DATA_CSV } from "./sampleData";

const SAMPLE_PROJECT_NAME = "Sample Project";
const SAMPLE_PROJECT_DESCRIPTION = "A sample project to help you get started with travel recommendations";
const SAMPLE_CSV_FILE_NAME = "sample-data.csv";
const COLUMNS = {
  input: "input",
  output: "output",
  expectedOutput: "expected_output",
  tags: "tags",
  systemInstruction: "system_instruction",
  modelLabel: "model_nickname",
  humanEvalScore: "human_evaluation",
  humanEvalNotes: "human_evaluation_notes",
  inferenceAnalytics: "inference_analytics",
  llmEvaluations: "llm_evaluations",
  metadata: "metadata",
};

let defaultAuthSampleChecked = false;

/** @PostConstruct: with auth disabled, give the default user its evaluators and sample project. */
export async function initiateSampleProjectForDefaultAuth(ctx: Ctx): Promise<void> {
  if (defaultAuthSampleChecked || authEnabled(ctx.env)) return;
  defaultAuthSampleChecked = true;
  const user = await findUserByEmail(ctx.db, ctx.env.SYSTEM_USER_EMAIL);
  if (!user) return; // no default user found
  const userCtx: Ctx = { ...ctx, user };
  const projectCount = await ProjectRepository.countByUser(ctx.db, user.id);
  if (projectCount === 0) {
    const evaluators = await HumanEvaluatorService.getEvaluators(userCtx, user);
    if (evaluators.length === 0) {
      // no default evaluators created
      await HumanEvaluatorService.createUserThumbsEvaluator(userCtx, user);
      await PointwiseHeuristicEvaluatorService.createDefaultHeuristicEvaluators(userCtx, user);
    }
    await createSampleProjectForUser(userCtx, user);
  }
}

export async function createSampleProjectForUser(ctx: Ctx, user: AuthUser): Promise<ProjectDTO.ProjectDTO> {
  console.log(`Starting sample project creation for user: ${user.id}`);
  const userCtx: Ctx = { ...ctx, user };

  const defaultProject = ProjectEntity.create({
    userId: user.id,
    name: SAMPLE_PROJECT_NAME,
    description: SAMPLE_PROJECT_DESCRIPTION,
    isDefault: true,
  });
  const project = ProjectDTO.of(await ProjectRepository.saveAndFlush(ctx.db, defaultProject));
  console.log(`Created sample project: ${project.project_id} for user: ${user.id}`);

  try {
    const importResult = await importSampleData(userCtx, user, project.project_id as string);
    console.log(
      `Imported sample data for project: ${project.project_id}, successful rows: ${importResult.successfulRows}, failed rows: ${importResult.failedRows}`,
    );
  } catch (e) {
    // Don't throw - the project was created successfully.
    console.error(`Failed to import sample data for user: ${user.id}`, e);
  }

  console.log(`Completed sample project creation for user: ${user.id}`);
  return project;
}

async function importSampleData(ctx: Ctx, user: AuthUser, projectId: string): Promise<ImportResultDTO> {
  const file = new File([SAMPLE_DATA_CSV], SAMPLE_CSV_FILE_NAME, { type: "text/csv" });
  const importRequest = {
    file,
    user,
    sourceType: ChatTurnContainerType.PROJECT,
    sourceId: projectId,
    chatColumnName: null, // not used for simple import
    metadataColumnNames: COLUMNS.metadata ? COLUMNS.metadata.split(",") : [],
    inputColumnName: COLUMNS.input,
    outputColumnName: COLUMNS.output,
    expectedOutputColumnName: COLUMNS.expectedOutput,
    tagsColumnName: COLUMNS.tags,
    systemInstructionColumnName: COLUMNS.systemInstruction,
    modelLabelColumnName: COLUMNS.modelLabel,
    humanEvalScoreColumnName: COLUMNS.humanEvalScore,
    humanEvalNotesColumnName: COLUMNS.humanEvalNotes,
    inferenceAnalyticsColumnName: COLUMNS.inferenceAnalytics,
    llmEvaluationsColumnName: COLUMNS.llmEvaluations,
  } as ChatImportRequest;
  return ChatImportService.importChatsFromFile(ctx, importRequest);
}
