import { bool, newId, toBool } from "../lib/db";
import type { CriteriaType } from "../enums/CriteriaType";
import * as CriteriaTypeConverter from "../util/converter/CriteriaTypeConverter";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "pointwise_heuristic_evaluator";
export const ID_PREFIX = "heuristic-eval-";

export interface PointwiseHeuristicEvaluator {
  id: string | null;
  name: string | null;
  criteria: string | null;
  criteriaType: CriteriaType | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** column is_deprecated */
  deprecated: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export const COLUMNS: Record<keyof PointwiseHeuristicEvaluator, string> = {
  id: "id",
  name: "name",
  criteria: "criteria",
  criteriaType: "criteria_type",
  userId: "user_id",
  deprecated: "is_deprecated",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<PointwiseHeuristicEvaluator> = {}): PointwiseHeuristicEvaluator {
  return {
    id: null,
    name: null,
    criteria: null,
    criteriaType: null,
    userId: null,
    deprecated: false,
    createdAt: null,
    updatedAt: null,
    ...init,
  };
}

export function prePersist(e: PointwiseHeuristicEvaluator): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): PointwiseHeuristicEvaluator {
  return {
    id: str(row.id),
    name: str(row.name),
    criteria: str(row.criteria),
    criteriaType: CriteriaTypeConverter.convertToEntityAttribute(row.criteria_type),
    userId: str(row.user_id),
    deprecated: toBool(row.is_deprecated) ?? false,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

export function toRow(e: PointwiseHeuristicEvaluator): Record<string, Param> {
  return {
    id: e.id,
    name: e.name,
    criteria: e.criteria,
    criteria_type: CriteriaTypeConverter.convertToDatabaseColumn(e.criteriaType),
    user_id: e.userId,
    is_deprecated: bool(e.deprecated ?? false),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

export function toJson(e: PointwiseHeuristicEvaluator): Record<string, unknown> {
  const { userId: _u, ...rest } = e;
  return rest;
}
