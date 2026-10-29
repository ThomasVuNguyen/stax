import { newId } from "../lib/db";
import type { DataSetType } from "../enums/DataSetType";
import { EvaluationType } from "../enums/EvaluationType";
import * as DataSetTypeConverter from "../util/converter/DataSetTypeConverter";
import * as EvaluationTypeConverter from "../util/converter/EvaluationTypeConverter";
import { type Param, type Row, str } from "./EntitySupport";
import type { EvaluationContainerBase } from "./EvaluationContainer";

/** DataSet is the "DATASET" row type of the single table `evaluation_container`. */
export const TABLE = "evaluation_container";
export const DISCRIMINATOR = "DATASET";
export const ID_PREFIX = "dataset-";

export interface DataSet extends EvaluationContainerBase {
  /** Discriminator (container_type); not a Java field. */
  containerType: "DATASET";
  /** `dataset_type` column (DataSetTypeConverter). */
  type: DataSetType | null;
}

export const COLUMNS: Record<Exclude<keyof DataSet, "containerType">, string> = {
  id: "id",
  userId: "user_id",
  name: "name",
  description: "description",
  evaluationType: "evaluation_type",
  createdAt: "created_at",
  updatedAt: "updated_at",
  type: "dataset_type",
};

export function create(init: Partial<Omit<DataSet, "containerType">> = {}): DataSet {
  return {
    id: null,
    userId: null,
    name: null,
    description: null,
    evaluationType: null,
    createdAt: null,
    updatedAt: null,
    type: null,
    ...init,
    containerType: "DATASET",
  };
}

/** @PrePersist: id and default evaluationType POINTWISE. */
export function prePersist(e: DataSet): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
  if (e.evaluationType == null) e.evaluationType = EvaluationType.POINTWISE;
}

export function getIdPrefix(_e?: DataSet): string {
  return ID_PREFIX;
}

export function fromRow(row: Row): DataSet {
  return {
    containerType: "DATASET",
    id: str(row.id),
    userId: str(row.user_id),
    name: str(row.name),
    description: str(row.description),
    evaluationType: EvaluationTypeConverter.convertToEntityAttribute(row.evaluation_type),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    type: DataSetTypeConverter.convertToEntityAttribute(row.dataset_type),
  };
}

export function toRow(e: DataSet): Record<string, Param> {
  return {
    id: e.id,
    container_type: DISCRIMINATOR,
    user_id: e.userId,
    name: e.name,
    description: e.description,
    evaluation_type: EvaluationTypeConverter.convertToDatabaseColumn(e.evaluationType),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    is_protected: null,
    is_default: null,
    dataset_type: DataSetTypeConverter.convertToDatabaseColumn(e.type),
  };
}

export function toJson(e: DataSet): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    evaluationType: e.evaluationType,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    idPrefix: ID_PREFIX,
    type: e.type,
  };
}
