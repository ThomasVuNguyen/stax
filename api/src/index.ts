import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv, Env } from "./env";
import { authMiddleware } from "./lib/auth";
import { onError } from "./lib/errors";
import { getJobHandler, type JobMessage } from "./lib/queue";
import { controllers, crons } from "./generated/registry";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: (origin) => (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"],
    allowHeaders: ["Authorization", "Cache-Control", "Content-Type"],
    credentials: true,
  }),
);
app.use("*", authMiddleware);
for (const controller of controllers) app.route("/", controller);

app.notFound((c) =>
  c.json({ error: `Path not found: ${c.req.path.replace(/^\//, "")}`, type: "PATH_NOT_FOUND" }, 400),
);
app.onError(onError);

export default {
  fetch: app.fetch,

  async queue(batch: MessageBatch<JobMessage>, env: Env, exec: ExecutionContext) {
    await Promise.all(
      batch.messages.map(async (msg) => {
        const handler = getJobHandler(msg.body.kind);
        if (!handler) {
          console.error(`No handler for job kind ${msg.body.kind}`);
          msg.ack();
          return;
        }
        // The Java listeners acked before processing (at-most-once); handlers record their own
        // failures on the job/inference/evaluation status rows, so a failed message is not retried.
        try {
          await handler(msg.body.payload, env, exec);
        } catch (e) {
          console.error(`Job ${msg.body.kind} failed`, e);
        }
        msg.ack();
      }),
    );
  },

  async scheduled(_event: ScheduledController, env: Env, exec: ExecutionContext) {
    for (const cron of crons) exec.waitUntil(cron.scheduled(env, exec));
  },
} satisfies ExportedHandler<Env, JobMessage>;
