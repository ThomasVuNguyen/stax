/**
 * Abstract base of the single-table hierarchy `evaluation_container`
 * (@Inheritance(SINGLE_TABLE), discriminator column `container_type`):
 *   - "PROJECT" → Project (is_protected, is_default)
 *   - "DATASET" → DataSet (dataset_type)
 * `fromRow` dispatches on the discriminator. `containerType` is the discriminator value and is
 * not a Java field (it is never serialised by toJson).
 */
import type { EvaluationType } from "../enums/EvaluationType";
import * as DataSetEntity from "./DataSet";
import type { DataSet } from "./DataSet";
import { type Param, type Row } from "./EntitySupport";
import * as ProjectEntity from "./Project";
import type { Project } from "./Project";

export const TABLE = "evaluation_container";
export const DISCRIMINATOR_COLUMN = "container_type";

export interface EvaluationContainerBase {
  id: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  name: string | null;
  description: string | null;
  evaluationType: EvaluationType | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type EvaluationContainer = Project | DataSet;

/** Base-class property → column (shared by both subclasses). */
export const COLUMNS: Record<keyof EvaluationContainerBase, string> = {
  id: "id",
  userId: "user_id",
  name: "name",
  description: "description",
  evaluationType: "evaluation_type",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function fromRow(row: Row): EvaluationContainer {
  return row.container_type === "DATASET" ? DataSetEntity.fromRow(row) : ProjectEntity.fromRow(row);
}

export function toRow(e: EvaluationContainer): Record<string, Param> {
  return e.containerType === "DATASET" ? DataSetEntity.toRow(e) : ProjectEntity.toRow(e);
}

export function toJson(e: EvaluationContainer): Record<string, unknown> {
  return e.containerType === "DATASET" ? DataSetEntity.toJson(e) : ProjectEntity.toJson(e);
}

/** @PrePersist of the concrete subclass. */
export function prePersist(e: EvaluationContainer): void {
  if (e.containerType === "DATASET") DataSetEntity.prePersist(e);
  else ProjectEntity.prePersist(e);
}

/** `getIdPrefix()` */
export function getIdPrefix(e: EvaluationContainer): string {
  return e.containerType === "DATASET" ? DataSetEntity.ID_PREFIX : ProjectEntity.ID_PREFIX;
}

export function isProject(e: EvaluationContainer | null | undefined): e is Project {
  return !!e && e.containerType === "PROJECT";
}

export function isDataSet(e: EvaluationContainer | null | undefined): e is DataSet {
  return !!e && e.containerType === "DATASET";
}
