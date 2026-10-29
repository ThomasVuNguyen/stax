import { newId, bool, toBool } from "../lib/db";
import { EvaluationType } from "../enums/EvaluationType";
import * as EvaluationTypeConverter from "../util/converter/EvaluationTypeConverter";
import { type Param, type Row, str } from "./EntitySupport";
import type { EvaluationContainerBase } from "./EvaluationContainer";

/** Project is the "PROJECT" row type of the single table `evaluation_container`. */
export const TABLE = "evaluation_container";
export const DISCRIMINATOR = "PROJECT";
export const ID_PREFIX = "project-";

export interface Project extends EvaluationContainerBase {
  /** Discriminator (container_type); not a Java field. */
  containerType: "PROJECT";
  /** Raw column; use getIsProtected() for the Java getter semantics (null → false). */
  isProtected: boolean | null;
  /** Raw column; use getIsDefault() for the Java getter semantics (null → false). */
  isDefault: boolean | null;
}

export const COLUMNS: Record<Exclude<keyof Project, "containerType">, string> = {
  id: "id",
  userId: "user_id",
  name: "name",
  description: "description",
  evaluationType: "evaluation_type",
  createdAt: "created_at",
  updatedAt: "updated_at",
  isProtected: "is_protected",
  isDefault: "is_default",
};

export function create(init: Partial<Omit<Project, "containerType">> = {}): Project {
  return {
    id: null,
    userId: null,
    name: null,
    description: null,
    evaluationType: null,
    createdAt: null,
    updatedAt: null,
    isProtected: null,
    isDefault: null,
    ...init,
    containerType: "PROJECT",
  };
}

/** @PrePersist: id and default evaluationType POINTWISE. */
export function prePersist(e: Project): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
  if (e.evaluationType == null) e.evaluationType = EvaluationType.POINTWISE;
}

export function getIsProtected(e: Project): boolean {
  return e.isProtected ?? false;
}

export function getIsDefault(e: Project): boolean {
  return e.isDefault ?? false;
}

export function getIdPrefix(_e?: Project): string {
  return ID_PREFIX;
}

export function fromRow(row: Row): Project {
  return {
    containerType: "PROJECT",
    id: str(row.id),
    userId: str(row.user_id),
    name: str(row.name),
    description: str(row.description),
    evaluationType: EvaluationTypeConverter.convertToEntityAttribute(row.evaluation_type),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    isProtected: toBool(row.is_protected),
    isDefault: toBool(row.is_default),
  };
}

export function toRow(e: Project): Record<string, Param> {
  return {
    id: e.id,
    container_type: DISCRIMINATOR,
    user_id: e.userId,
    name: e.name,
    description: e.description,
    evaluation_type: EvaluationTypeConverter.convertToDatabaseColumn(e.evaluationType),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    is_protected: bool(e.isProtected),
    is_default: bool(e.isDefault),
    dataset_type: null,
  };
}

/** Jackson view: getIsProtected()/getIsDefault() default to false; `idPrefix` from getIdPrefix(). */
export function toJson(e: Project): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    evaluationType: e.evaluationType,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    idPrefix: ID_PREFIX,
    isProtected: getIsProtected(e),
    isDefault: getIsDefault(e),
  };
}
