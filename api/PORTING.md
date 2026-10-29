# Porting the Spring Boot server to Cloudflare Workers

`api/` is a TypeScript Cloudflare Worker (Hono + D1 + Queues + R2) that replaces `server/`
(Spring Boot + MySQL + Pub/Sub + GCS + Redis). It must serve **the same HTTP API** so the
Next.js frontend works unchanged: same paths, methods, query params, request bodies, response
JSON shapes, status codes and error bodies.

Several people port different Java packages **at the same time**. Code written by one person
calls code written by another before it exists. That only works if everybody follows the
mapping rules below exactly, so that an import path and a function name can be predicted from
the Java source alone.

## Source → target mapping

Java root: `server/src/main/java/com/planck/planck/`. TS root: `api/src/`.

| Java | TypeScript |
|---|---|
| `entitities/Foo.java` | `src/entities/Foo.ts` (note the spelling fix) |
| `enums/Foo.java` | `src/enums/Foo.ts` |
| `util/Foo.java` | `src/util/Foo.ts` |
| `llmproviders/**/Foo.java` | `src/llmproviders/**/Foo.ts` |
| `domain/<pkg>/**/Foo.java` | `src/domain/<pkg>/**/Foo.ts` (same sub-folders) |
| `annotation/*Validator.java` | `src/annotation/Foo.ts` (plain validation functions) |
| `config/ApplicationLimits.java`, `config/DefaultRetryProperties.java` | `src/config/Foo.ts` (constants) |

- **Service interface + Impl** (`FooService` + `FooServiceImpl`): one file named after the
  **interface**, `FooService.ts`. A class with no interface keeps its own name.
- **Exports are functions named exactly like the Java methods** (`findById`, `createProject`,
  `getEvaluationAnalytics`…). No classes for services/repositories. Overloads: keep the Java
  name for the most common one and add a descriptive suffix for the others
  (`getChatTurns`, `getChatTurnsByIds`), and mention it in the file's header comment.
- Callers import whole modules: `import * as ProjectService from "../project/ProjectService";`
  then `ProjectService.getProject(ctx, id)`.
- Static helpers on entities or utils: export them as functions from the same file.
- DTOs: `domain/<pkg>/dto/Foo.java` → `src/domain/<pkg>/dto/Foo.ts` exporting
  `interface Foo` (field names = **JSON names**, i.e. what Jackson emits/accepts). Builders,
  `from(...)` factories and other static methods become exported functions in the same file.
- Enums: `export const Foo = { A: "A", B: "B" } as const; export type Foo = (typeof Foo)[keyof typeof Foo];`
  Enum methods/fields become exported functions/maps. If an enum is persisted by **ordinal**
  (`@Enumerated(EnumType.ORDINAL)` or default without `STRING`), also export
  `FooOrdinal: Foo[]` and convert at the repository boundary.

## Function signatures

```ts
import type { Ctx } from "../../lib/ctx";        // { env, db, user, waitUntil }
export async function getProject(ctx: Ctx, projectId: string): Promise<Project> { … }
```

- **Services and other domain helpers** take `ctx: Ctx` first. The current user is
  `requireUser(ctx)` (replaces `SecurityContextHolder` / `@AuthenticationPrincipal`).
- **Repositories** take `db: D1Database` first: `findById(db, id)`.
- Everything that touches I/O is `async`.

## Entities and repositories

- Entities are plain interfaces whose fields are the **Java field names**. A `@ManyToOne` /
  `@OneToOne` owning side `Foo foo` becomes `fooId: string | null` (the FK column). Collections
  (`@OneToMany`, `@ManyToMany`) are **not** on the interface; load them with repository
  functions (`findInputsByTurnId(db, turnId)` etc.).
- Each entity file exports `TABLE`, `ID_PREFIX` (if any), `fromRow(row)`, `toRow(entity)`
  (column → value, booleans 0/1, JSON stringified) and `toJson(entity)` which reproduces what
  Jackson emitted for the scalar fields (honour `@JsonIgnore`, `@JsonProperty`, custom getters
  that Jackson serialises, `@JsonInclude(NON_NULL)`). Callers add nested relation objects to
  the JSON themselves when the Java entity graph serialised them.
- `@PrePersist` id generation: `newId(ID_PREFIX)` from `lib/db.ts`. `@CreationTimestamp` /
  `@UpdateTimestamp`: set `createdAt`/`updatedAt` to `now()` in `save`.
- Repository `save(db, entity)` is an upsert (`INSERT … ON CONFLICT(id) DO UPDATE`) and returns
  the saved entity. `saveAll`, `deleteById`, `deleteAll…`, `existsBy…`, `countBy…` and every
  derived/`@Query` method used anywhere get a function with the Spring method name.
- Pageable methods take `{ page, size, sort? }` and return `Page<T>` from `src/util/Page.ts`
  (`{ content, totalElements, totalPages, number, size, … }` — the Spring `Page` JSON shape).
- JPA cascades: the schema keeps the MySQL foreign keys, including `ON DELETE CASCADE`. Other
  JPA-level cascades (`CascadeType.ALL`, `orphanRemoval`) must be done explicitly.

## Database (D1 / SQLite)

- Schema: `migrations/0001_schema.sql` (generated from Liquibase; same table/column names).
  Seed data: `migrations/0002_seed.sql`. Do not edit them by hand; if a column is missing,
  say so in your report.
- Use helpers in `src/lib/db.ts`: `all`, `first`, `run`, `scalar`, `allIn` (chunked IN),
  `insert`, `update`, `stmt` + `db.batch([...])`, `bool`, `toBool`, `parseJson`, `now`, `newId`.
- Translate MySQL to SQLite: `JSON_EXTRACT` → `json_extract`, `IFNULL` ok, `NOW()` → a bound
  `now()` value, `DATE_FORMAT` → `strftime`, `GROUP_CONCAT` ok, booleans are 0/1,
  timestamps are ISO strings (`2025-01-01T00:00:00.000Z`) so they sort/compare as text.
- D1 has a limit of 100 bound parameters per statement — use `allIn`/`chunk` for big IN lists.
- `@Transactional`: D1 has no interactive transactions. Put writes that must be atomic in one
  `ctx.db.batch([...])`; otherwise run them sequentially.

## HTTP layer

- `domain/<pkg>/FooController.java` → `src/domain/<pkg>/FooController.ts` with
  `const app = new Hono<AppEnv>(); … export default app;` using the **full path** (class-level
  `@RequestMapping` + method mapping). Leading `/` always. All controller files are mounted at
  the root automatically (any `*Controller.ts` default export).
- Build the context with `const ctx = ctxFromHono(c);`.
- Bodies: `await jsonBody<Foo>(c)`; query params: `c.req.query`, `queryInt`, `queryBool`,
  `queryList`, `queryEnum` (from `lib/http.ts`). Multipart: `await c.req.parseBody()`.
- Responses: `c.json(body, status)`. `ResponseEntity.ok()` with no body → `c.body(null, 200)`;
  `noContent()` → `c.body(null, 204)`. Plain strings → `c.text(...)`.
- Errors: throw the classes in `src/lib/errors.ts` (same names as the Java exceptions; add a new
  one there only if missing — keep `{ error, type }` and the same status/type as
  `GlobalExceptionHandler`). `NotFoundException` and `ValidationException` have their own body
  shapes and are already handled.
- Bean validation (`@Valid`, `@NotBlank`, `@Size`, custom annotations): validate explicitly and
  throw `InvalidDataException("field: message")` (MethodArgumentNotValidException format) or
  `ValidationException([{ error: msg }])` (ConstraintViolationException format), matching which
  one Spring would have raised.
- `@PreAuthorize("hasPermission(#projectId, 'PROJECT', 'read')")` →
  `await assertProjectAccess(ctx, projectId, "read")` from `lib/permissions.ts`.
- `@RateLimited(...)` → `rateLimit(c, "<methodName>", maxRequests, windowSeconds)`.
- `@CheckJobActive` aspect: port the check as a function in `src/aspect/JobStatusCheck.ts`
  (owned by whoever owns `domain/job`) and call it explicitly.
- Server-sent events: `streamSSE` from `hono/streaming`.
- Ignore Swagger/OpenAPI annotations entirely.

## Background work

- Pub/Sub publishers → `publish(ctx.env, kind, payload)` / `publishAll(...)` from
  `src/lib/queue.ts`. Kinds: `inference`, `llm-eval`, `heuristic-eval`, `user-deletion`
  (one queue; the per-provider topics are gone). Payload = the DTO the Java code serialised.
- Pub/Sub listeners → in your package create `jobs.ts` that calls
  `registerJobHandler(kind, async (payload, env, exec) => { const ctx = ctxFromJob(env, exec); … })`.
  All `jobs.ts` files are imported at startup automatically.
- `@Async`, `CompletableFuture.runAsync`, executors: `await` the work, or
  `ctx.waitUntil(promise)` when the Java code returned before the work finished. Long fan-outs
  (bulk inference / evaluation over many rows) should go through the queue, as they already do.
- `@Scheduled` cron jobs → export `async function scheduled(env, exec)` from a `cron.ts` in
  your package; the Worker's `scheduled()` handler calls every `cron.ts`.
- Each queue message gets at most ~15 minutes of wall time, and a request ~30s of CPU (I/O
  wait on LLM calls does not count).

## External services

- LLM providers: call the HTTP APIs with `fetch` (no SDKs). Keep the request/response
  mapping, error classification and retry behaviour (`util/RetryUtils`, `llm-providers.retry`
  in application.yaml) of the Java strategies.
- API keys stored per user are AES-GCM encrypted: `encrypt(env.AES_SECRET_KEY, v)` /
  `decrypt(...)` from `lib/crypto.ts`.
- GCS → R2 (`env.FILES`: `put`, `get`, `delete`). Signed upload URLs are not available; the
  frontend uploads CSVs directly to the API.
- Redis / feature gates → file-based defaults only (`default-feature-flags.json`).
- Gmail / JavaMail: not supported on Workers; turn into a no-op that logs, and say so.
- Google OAuth: `fetch` to `https://oauth2.googleapis.com/token` and the userinfo / tokeninfo
  endpoints.

## Config

Spring `@Value("${...}")` properties come from `ctx.env` (see `src/env.ts`). Add new ones there
and to `wrangler.jsonc` `vars` only if really needed, and report it.

## Checking your work

- `cd api && npx tsc --noEmit -p .` must report **no errors in files you own**. Errors caused by
  imports of files other people have not written yet are expected; list those imports in your
  report.
- Port **all** endpoints and behaviour, not only what the frontend uses today; do not invent new
  behaviour. When something cannot work on Workers, implement the closest equivalent and say
  so.
- Keep code idiomatic and compact TypeScript; comment where behaviour is non-obvious, not every
  line.
- Only create/modify files inside the packages you were assigned (plus adding an exception class
  to `lib/errors.ts` or a var to `env.ts` if unavoidable).
