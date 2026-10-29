import { bool, newId, parseJson, toBool } from "../lib/db";
import type { LinkedEntityType } from "../enums/LinkedEntityType";
import type { ScopeType } from "../enums/ScopeType";
import type { ScoringMechanismType } from "../enums/ScoringMechanismType";
import * as LinkedEntityTypeConverter from "../util/converter/LinkedEntityTypeConverter";
import * as ScopeTypeConverter from "../util/converter/ScopeTypeConverter";
import * as ScoringMechanismTypeConverter from "../util/converter/ScoringMechanismTypeConverter";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "human_evaluators";
export const ID_PREFIX = "human-eval-";

/** Shape of domain/evaluator/human/dto/HumanCategoryOption stored in `categories` (JSON text). */
export interface HumanCategoryOptionJson {
  categoryName: string | null;
  score: number | null;
  description: string | null;
  id: string | null;
}

export interface HumanEvaluator {
  id: string | null;
  name: string | null;
  description: string | null;
  /** @ManyToOne User user (user_id); null for system evaluators */
  userId: string | null;
  scopeType: ScopeType | null;
  scoringMechanismType: ScoringMechanismType | null;
  /** JSON string (List<HumanCategoryOption>), kept as text like the Java String field. */
  categories: string | null;
  comments: string | null;
  /** JSON string, kept as text. */
  rangeOptions: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** column is_deprecated */
  deprecated: boolean;
  associatedEntityId: string | null;
  linkedEntityType: LinkedEntityType | null;
}

export const COLUMNS: Record<keyof HumanEvaluator, string> = {
  id: "id",
  name: "name",
  description: "description",
  userId: "user_id",
  scopeType: "scope_type",
  scoringMechanismType: "scoring_mechanism_type",
  categories: "categories",
  comments: "comments",
  rangeOptions: "range_options",
  createdAt: "created_at",
  updatedAt: "updated_at",
  deprecated: "is_deprecated",
  associatedEntityId: "associated_entity_id",
  linkedEntityType: "linked_entity_type",
};

export function create(init: Partial<HumanEvaluator> = {}): HumanEvaluator {
  return {
    id: null,
    name: null,
    description: null,
    userId: null,
    scopeType: null,
    scoringMechanismType: null,
    categories: null,
    comments: null,
    rangeOptions: null,
    createdAt: null,
    updatedAt: null,
    deprecated: false,
    associatedEntityId: null,
    linkedEntityType: null,
    ...init,
  };
}

export function prePersist(e: HumanEvaluator): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

/** JSON columns may come back as already-parsed text or double-encoded strings; keep text. */
function jsonText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function fromRow(row: Row): HumanEvaluator {
  return {
    id: str(row.id),
    name: str(row.name),
    description: str(row.description),
    userId: str(row.user_id),
    scopeType: ScopeTypeConverter.convertToEntityAttribute(row.scope_type),
    scoringMechanismType: ScoringMechanismTypeConverter.convertToEntityAttribute(row.scoring_mechanism_type),
    categories: jsonText(row.categories),
    comments: str(row.comments),
    rangeOptions: jsonText(row.range_options),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    deprecated: toBool(row.is_deprecated) ?? false,
    associatedEntityId: str(row.associated_entity_id),
    linkedEntityType: LinkedEntityTypeConverter.convertToEntityAttribute(row.linked_entity_type),
  };
}

export function toRow(e: HumanEvaluator): Record<string, Param> {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    user_id: e.userId,
    scope_type: ScopeTypeConverter.convertToDatabaseColumn(e.scopeType),
    scoring_mechanism_type: ScoringMechanismTypeConverter.convertToDatabaseColumn(e.scoringMechanismType),
    categories: e.categories,
    comments: e.comments,
    range_options: e.rangeOptions,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    is_deprecated: bool(e.deprecated ?? false),
    associated_entity_id: e.associatedEntityId,
    linked_entity_type: LinkedEntityTypeConverter.convertToDatabaseColumn(e.linkedEntityType),
  };
}

/** Scalar fields + getter `activeCategories`; callers add `user`. */
export function toJson(e: HumanEvaluator): Record<string, unknown> {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    scopeType: e.scopeType,
    scoringMechanismType: e.scoringMechanismType,
    categories: e.categories,
    comments: e.comments,
    rangeOptions: e.rangeOptions,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    deprecated: e.deprecated,
    associatedEntityId: e.associatedEntityId,
    linkedEntityType: e.linkedEntityType,
    activeCategories: getActiveCategories(e),
  };
}

function readCategories(e: HumanEvaluator): HumanCategoryOptionJson[] | null {
  const list = parseJson<HumanCategoryOptionJson[]>(e.categories);
  return Array.isArray(list) ? list : null;
}

/** `getActiveCategories()`: parsed categories, [] when absent. */
export function getActiveCategories(e: HumanEvaluator): HumanCategoryOptionJson[] {
  return readCategories(e) ?? [];
}

export function addCategory(e: HumanEvaluator, category: HumanCategoryOptionJson): void {
  const all = readCategories(e) ?? [];
  all.push(category);
  e.categories = JSON.stringify(all);
}

export function removeCategory(e: HumanEvaluator, categoryId: string): void {
  const all = readCategories(e);
  if (all) e.categories = JSON.stringify(all.filter((c) => c.id !== categoryId));
}

export function updateCategory(
  e: HumanEvaluator,
  categoryId: string,
  newName: string | null,
  newDescription: string | null,
  newScore: number | null,
): void {
  const all = readCategories(e);
  if (!all) return;
  const cat = all.find((c) => c.id === categoryId);
  if (cat) {
    cat.categoryName = newName;
    cat.description = newDescription;
    cat.score = newScore;
  }
  e.categories = JSON.stringify(all);
}
