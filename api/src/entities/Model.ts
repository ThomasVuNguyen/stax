import { bool, newId, toBool } from "../lib/db";
import { ModelProvider } from "../enums/ModelProvider";
import { ModelType } from "../enums/ModelType";
import * as ModelProviderConverter from "../util/converter/ModelProviderConverter";
import * as ModelTypeConverter from "../util/converter/ModelTypeConverter";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "model";
export const ID_PREFIX = "model-";

export interface Model {
  /** JSON name "model_id" (@JsonProperty) */
  id: string | null;
  provider: ModelProvider | null;
  name: string | null;
  /** @ManyToOne User user (user_id) */
  userId: string | null;
  /** Display name on the UI. */
  label: string | null;
  version: string | null;
  url: string | null;
  type: ModelType | null;
  /** column is_deprecated (Java field `isDeprecated`, JSON "deprecated") */
  isDeprecated: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  description: string | null;
  comments: string | null;
  /** JSON text */
  properties: string | null;
  /** JSON text */
  descriptors: string | null;
  releaseDate: string | null;
}

export const COLUMNS: Record<keyof Model, string> = {
  id: "id",
  provider: "provider",
  name: "name",
  userId: "user_id",
  label: "label",
  version: "version",
  url: "url",
  type: "type",
  isDeprecated: "is_deprecated",
  createdAt: "created_at",
  updatedAt: "updated_at",
  description: "description",
  comments: "comments",
  properties: "properties",
  descriptors: "descriptors",
  releaseDate: "release_date",
};

export function create(init: Partial<Model> = {}): Model {
  return {
    id: null,
    provider: null,
    name: null,
    userId: null,
    label: null,
    version: null,
    url: null,
    type: null,
    isDeprecated: false,
    createdAt: null,
    updatedAt: null,
    description: null,
    comments: null,
    properties: null,
    descriptors: null,
    releaseDate: null,
    ...init,
  };
}

/** Java `new Model(provider, label, name, url, description, properties, descriptors, user)` (system model). */
export function createSystemModel(
  provider: ModelProvider,
  label: string,
  name: string,
  url: string,
  description: string | null,
  properties: string | null,
  descriptors: string | null,
  userId: string | null,
): Model {
  return create({ provider, label, name, url, description, type: ModelType.SYSTEM, properties, descriptors, userId });
}

/**
 * Java copy constructor `new Model(currentModel)` (user model). Note: like Java it does NOT copy
 * `properties` or `user`.
 */
export function createUserModelFrom(current: Model): Model {
  return create({
    description: current.description,
    name: current.name,
    label: current.label,
    provider: current.provider,
    version: current.version,
    url: current.url,
    comments: current.comments,
    descriptors: current.descriptors,
    isDeprecated: current.isDeprecated,
    releaseDate: current.releaseDate,
    type: ModelType.USER,
  });
}

export function prePersist(e: Model): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function getEntityId(e: Model): string | null {
  return e.id;
}

const DEFAULT_ENDPOINTS: Record<ModelProvider, string> = {
  OPENAI: "https://api.openai.com",
  MISTRAL: "https://api.mistral.ai",
  GOOGLE: "https://generativelanguage.googleapis.com",
  ANTHROPIC: "https://api.anthropic.com",
  DEEPSEEK: "https://api.deepseek.ai",
  GROK: "https://api.grok.ai",
  LLAMA: "https://api.llama.com",
};

/** `isCustomEndpoint()`: user model whose url is not the provider's default API host. */
export function isCustomEndpoint(e: Model): boolean {
  if (e.type === ModelType.SYSTEM || e.url == null) return false;
  const def = e.provider ? DEFAULT_ENDPOINTS[e.provider] : undefined;
  return def ? !e.url.includes(def) : false;
}

function jsonText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

export function fromRow(row: Row): Model {
  return {
    id: str(row.id),
    provider: ModelProviderConverter.convertToEntityAttribute(row.provider),
    name: str(row.name),
    userId: str(row.user_id),
    label: str(row.label),
    version: str(row.version),
    url: str(row.url),
    type: ModelTypeConverter.convertToEntityAttribute(row.type),
    isDeprecated: toBool(row.is_deprecated) ?? false,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    description: str(row.description),
    comments: str(row.comments),
    properties: jsonText(row.properties),
    descriptors: jsonText(row.descriptors),
    releaseDate: str(row.release_date),
  };
}

export function toRow(e: Model): Record<string, Param> {
  return {
    id: e.id,
    provider: ModelProviderConverter.convertToDatabaseColumn(e.provider),
    name: e.name,
    user_id: e.userId,
    label: e.label,
    version: e.version,
    url: e.url,
    type: ModelTypeConverter.convertToDatabaseColumn(e.type),
    is_deprecated: bool(e.isDeprecated ?? false),
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    description: e.description,
    comments: e.comments,
    properties: e.properties,
    descriptors: e.descriptors,
    release_date: e.releaseDate,
  };
}

/**
 * Jackson view: id as "model_id", boolean `isDeprecated` as "deprecated", plus getters
 * `customEndpoint` and `entityId`. Callers add `user`.
 */
export function toJson(e: Model): Record<string, unknown> {
  return {
    model_id: e.id,
    provider: e.provider,
    name: e.name,
    label: e.label,
    version: e.version,
    url: e.url,
    type: e.type,
    deprecated: e.isDeprecated,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    description: e.description,
    comments: e.comments,
    properties: e.properties,
    descriptors: e.descriptors,
    releaseDate: e.releaseDate,
    customEndpoint: isCustomEndpoint(e),
    entityId: e.id,
  };
}
