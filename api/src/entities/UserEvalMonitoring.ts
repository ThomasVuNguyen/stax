import { newId } from "../lib/db";
import { type Param, type Row, num, str } from "./EntitySupport";

/**
 * NOTE: the table `user_eval_monitoring` does not exist in migrations/0001_schema.sql (it was
 * never created by Liquibase) and no repository reads or writes it. The mapping is kept for
 * completeness only.
 */
export const TABLE = "user_eval_monitoring";
export const ID_PREFIX = "eval-monitoring-";

export interface UserEvalMonitoring {
  id: string | null;
  evalModelName: string | null;
  evalModelVersion: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** @ManyToOne Project project (project_id) */
  projectId: string | null;
  scorer: string | null;
  createdAt: string | null;
  timetaken: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
}

export const COLUMNS: Record<keyof UserEvalMonitoring, string> = {
  id: "id",
  evalModelName: "eval_model_name",
  evalModelVersion: "eval_model_version",
  userId: "user_id",
  projectId: "project_id",
  scorer: "scorer",
  createdAt: "created_at",
  timetaken: "timetaken",
  promptTokens: "prompt_tokens",
  completionTokens: "completion_tokens",
  totalTokens: "total_tokens",
  inputCost: "input_cost",
  outputCost: "output_cost",
  cost: "cost",
};

export function create(init: Partial<UserEvalMonitoring> = {}): UserEvalMonitoring {
  return {
    id: null,
    evalModelName: null,
    evalModelVersion: null,
    userId: null,
    projectId: null,
    scorer: null,
    createdAt: null,
    timetaken: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    inputCost: null,
    outputCost: null,
    cost: null,
    ...init,
  };
}

export function prePersist(e: UserEvalMonitoring): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): UserEvalMonitoring {
  return {
    id: str(row.id),
    evalModelName: str(row.eval_model_name),
    evalModelVersion: str(row.eval_model_version),
    userId: str(row.user_id),
    projectId: str(row.project_id),
    scorer: str(row.scorer),
    createdAt: str(row.created_at),
    timetaken: num(row.timetaken),
    promptTokens: num(row.prompt_tokens),
    completionTokens: num(row.completion_tokens),
    totalTokens: num(row.total_tokens),
    inputCost: num(row.input_cost),
    outputCost: num(row.output_cost),
    cost: num(row.cost),
  };
}

export function toRow(e: UserEvalMonitoring): Record<string, Param> {
  const out: Record<string, Param> = {};
  for (const [k, c] of Object.entries(COLUMNS)) out[c] = (e as unknown as Record<string, Param>)[k] ?? null;
  return out;
}

export function toJson(e: UserEvalMonitoring): Record<string, unknown> {
  const { userId: _u, projectId: _p, ...rest } = e;
  return rest;
}
