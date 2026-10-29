import type { Env } from "../env";

/**
 * Replaces the per-provider GCP Pub/Sub topics with a single Cloudflare Queue. Every message
 * carries a `kind`; modules register a handler per kind with `registerJobHandler`, and the
 * Worker's `queue()` export dispatches to it (see src/index.ts).
 *
 * Payloads are the same DTOs the Java code published as JSON (InferenceDTO, score DTOs, ...).
 */
export type JobKind = "inference" | "llm-eval" | "heuristic-eval" | "user-deletion";

export interface JobMessage<T = unknown> {
  kind: JobKind;
  payload: T;
}

export type JobHandler<T = unknown> = (payload: T, env: Env, ctx: ExecutionContext) => Promise<void>;

const handlers = new Map<JobKind, JobHandler<any>>();

export function registerJobHandler<T>(kind: JobKind, handler: JobHandler<T>) {
  handlers.set(kind, handler);
}

export function getJobHandler(kind: JobKind): JobHandler | undefined {
  return handlers.get(kind);
}

export async function publish<T>(env: Env, kind: JobKind, payload: T) {
  await env.JOBS.send({ kind, payload });
}

/** Queue.sendBatch accepts at most 100 messages per call. */
export async function publishAll<T>(env: Env, kind: JobKind, payloads: T[]) {
  for (let i = 0; i < payloads.length; i += 100) {
    await env.JOBS.sendBatch(payloads.slice(i, i + 100).map((payload) => ({ body: { kind, payload } })));
  }
}
