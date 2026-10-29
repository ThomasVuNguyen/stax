import { newId } from "../lib/db";
import { type Param, type Row, str } from "./EntitySupport";

export const TABLE = "api_keys";
export const ID_PREFIX = "api-keys-";

export interface ApiKeys {
  id: string | null;
  anthropicKey: string | null;
  openaiKey: string | null;
  mistralKey: string | null;
  googleKey: string | null;
  grokKey: string | null;
  ollamaKey: string | null;
  deepseekKey: string | null;
  huggingfaceKey: string | null;
  llamaKey: string | null;
  /** @OneToOne User user (api_keys.user_id, unique) */
  userId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** Java property → column (for ORDER BY / filters). */
export const COLUMNS: Record<keyof ApiKeys, string> = {
  id: "id",
  anthropicKey: "anthropic_key",
  openaiKey: "openai_key",
  mistralKey: "mistral_key",
  googleKey: "google_key",
  grokKey: "grok_key",
  ollamaKey: "ollama_key",
  deepseekKey: "deepseek_key",
  huggingfaceKey: "huggingface_key",
  llamaKey: "llama_key",
  userId: "user_id",
  createdAt: "created_at",
  updatedAt: "updated_at",
};

export function create(init: Partial<ApiKeys> = {}): ApiKeys {
  return {
    id: null,
    anthropicKey: null,
    openaiKey: null,
    mistralKey: null,
    googleKey: null,
    grokKey: null,
    ollamaKey: null,
    deepseekKey: null,
    huggingfaceKey: null,
    llamaKey: null,
    userId: null,
    createdAt: null,
    updatedAt: null,
    ...init,
  };
}

export function prePersist(e: ApiKeys): void {
  if (e.id == null) e.id = newId(ID_PREFIX);
}

export function fromRow(row: Row): ApiKeys {
  const e = create();
  for (const [k, c] of Object.entries(COLUMNS)) (e as unknown as Record<string, unknown>)[k] = str(row[c]);
  return e;
}

export function toRow(e: ApiKeys): Record<string, Param> {
  const out: Record<string, Param> = {};
  for (const [k, c] of Object.entries(COLUMNS)) out[c] = (e as unknown as Record<string, Param>)[k] ?? null;
  return out;
}

/** Jackson view of the scalar fields (the `user` relation is added by callers when needed). */
export function toJson(e: ApiKeys): Record<string, unknown> {
  return {
    id: e.id,
    anthropicKey: e.anthropicKey,
    openaiKey: e.openaiKey,
    mistralKey: e.mistralKey,
    googleKey: e.googleKey,
    grokKey: e.grokKey,
    ollamaKey: e.ollamaKey,
    deepseekKey: e.deepseekKey,
    huggingfaceKey: e.huggingfaceKey,
    llamaKey: e.llamaKey,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}
