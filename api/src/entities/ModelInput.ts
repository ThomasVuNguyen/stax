import { newId } from "../lib/db";
import { type InputRole, inputRoleFromOrdinal, inputRoleToOrdinal } from "../enums/InputRole";
import { type Param, type Row, jsonMap, mapColumn, str } from "./EntitySupport";

export const TABLE = "model_input";
export const ID_PREFIX = "model-input-";

export interface ModelInput {
  id: string | null;
  /** @ManyToOne ModelInput modelInput (parent_id) — unused in practice */
  modelInputId: string | null;
  text: string | null;
  /** Stored by ORDINAL in model_input.role (see InputRoleOrdinal). */
  role: InputRole | null;
  expectedOutput: string | null;
  variables: Record<string, string> | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
}

export const COLUMNS: Record<keyof ModelInput, string> = {
  id: "id",
  modelInputId: "parent_id",
  text: "text",
  role: "role",
  expectedOutput: "expected_output",
  variables: "variables",
  createdAt: "created_at",
  updatedAt: "updated_at",
  userId: "user_id",
};

export function create(init: Partial<ModelInput> = {}): ModelInput {
  return {
    id: null,
    modelInputId: null,
    text: null,
    role: null,
    expectedOutput: null,
    variables: null,
    createdAt: null,
    updatedAt: null,
    userId: null,
    ...init,
  };
}

/**
 * Java `new ModelInput(prompt, user[, variables])` / `new ModelInput(prompt, parent, user)`.
 * `prompt` is llmproviders/dto/Prompt (text + role).
 */
export function fromPrompt(
  prompt: { text?: string | null; role?: InputRole | null },
  userId: string | null,
  variables: Record<string, string> | null = null,
  parentId: string | null = null,
): ModelInput {
  return create({ text: prompt.text ?? null, role: prompt.role ?? null, userId, variables, modelInputId: parentId });
}

export function prePersist(e: ModelInput): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function getEntityId(e: ModelInput): string | null {
  return e.id;
}

/** `deepCopy()`: expectedOutput, variables, role, text, user (new id on save). */
export function deepCopy(e: ModelInput): ModelInput {
  return create({
    expectedOutput: e.expectedOutput,
    variables: e.variables,
    role: e.role,
    text: e.text,
    userId: e.userId,
  });
}

export function fromRow(row: Row): ModelInput {
  return {
    id: str(row.id),
    modelInputId: str(row.parent_id),
    text: str(row.text),
    role: inputRoleFromOrdinal(row.role),
    expectedOutput: str(row.expected_output),
    variables: jsonMap(row.variables),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    userId: str(row.user_id),
  };
}

export function toRow(e: ModelInput): Record<string, Param> {
  return {
    id: e.id,
    parent_id: e.modelInputId,
    text: e.text,
    role: inputRoleToOrdinal(e.role),
    expected_output: e.expectedOutput,
    variables: mapColumn(e.variables),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    user_id: e.userId,
  };
}

/** Scalar fields + getter `entityId`; callers add `modelInput`, `user`. Role is the enum name. */
export function toJson(e: ModelInput): Record<string, unknown> {
  return {
    id: e.id,
    text: e.text,
    role: e.role,
    expectedOutput: e.expectedOutput,
    variables: e.variables,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    entityId: e.id,
  };
}
