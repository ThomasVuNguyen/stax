/**
 * Shared fetch helpers for the LLM strategies (no Java counterpart: they replace the HTTP layers of
 * langchain4j, openai-java and google-genai).
 *
 * Errors:
 * - non-2xx responses throw LlmHttpError(status, message) where message is the provider's response
 *   body (what langchain4j's HttpException carried) unless a strategy reformats it;
 * - a request exceeding `timeoutMs` throws LlmTimeoutError (langchain4j TimeoutException);
 * - network failures propagate as plain Errors.
 */

export class LlmHttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: string = message,
  ) {
    super(message);
  }
}

export class LlmTimeoutError extends Error {
  constructor(message = "request timed out") {
    super(message);
  }
}

/** langchain4j's default read timeout. */
export const LANGCHAIN4J_TIMEOUT_MS = 60_000;

/** Drops null/undefined properties (the SDKs serialise requests with NON_NULL / NON_ABSENT). */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== null && v !== undefined) out[k] = v;
  return out as Partial<T>;
}

/** Appends `path` to `baseUrl`, adding a slash between them like langchain4j's ensureTrailingForwardSlash. */
export function joinUrl(baseUrl: string, path: string): string {
  return (baseUrl.endsWith("/") ? baseUrl : baseUrl + "/") + path.replace(/^\//, "");
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Builds the error message from status + body text; defaults to the body text. */
  errorMessage?: (status: number, statusText: string, body: string) => string;
}

/** Performs the request and returns the Response when 2xx, otherwise throws LlmHttpError. */
export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const init: RequestInit = {
    method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
    headers: { ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }), ...opts.headers },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  };
  if (opts.timeoutMs) init.signal = AbortSignal.timeout(opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (isTimeout(e)) throw new LlmTimeoutError();
    throw e;
  }
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    const message = opts.errorMessage ? opts.errorMessage(res.status, res.statusText, body) : body;
    throw new LlmHttpError(res.status, message || `HTTP ${res.status}`, body);
  }
  return res;
}

export async function requestJson<T = any>(url: string, opts: RequestOptions = {}): Promise<T> {
  const res = await request(url, opts);
  try {
    return (await res.json()) as T;
  } catch (e) {
    if (isTimeout(e)) throw new LlmTimeoutError();
    throw e;
  }
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

export interface SseEvent {
  event: string | null;
  data: string;
}

/** Parses a text/event-stream body into events (multi-line data joined with "\n"). */
export async function* sseEvents(res: Response): AsyncGenerator<SseEvent> {
  let event: string | null = null;
  let data: string[] = [];
  for await (const line of lines(res)) {
    if (line === "") {
      if (data.length) yield { event, data: data.join("\n") };
      event = null;
      data = [];
      continue;
    }
    if (line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx < 0 ? line : line.slice(0, idx);
    let value = idx < 0 ? "" : line.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (data.length) yield { event, data: data.join("\n") };
}

/** Parses a newline-delimited JSON body (Ollama streaming). */
export async function* ndjson(res: Response): AsyncGenerator<any> {
  for await (const line of lines(res)) {
    if (line.trim()) yield JSON.parse(line);
  }
}

async function* lines(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let finished = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        finished = true;
        break;
      }
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        let line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        yield line;
      }
    }
    if (buf) yield buf.endsWith("\r") ? buf.slice(0, -1) : buf;
  } finally {
    // Consumer stopped early: abort the upstream body instead of leaving it open.
    if (!finished) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
