/**
 * Port of domain/gcs/GCSFileProcessingController (`POST /auth/process`, unauthenticated): receives a
 * CloudEvent carrying Cloud Storage `StorageObjectData`, reads the object and answers with a text
 * summary (bucket/name, update time, content type, size, MD5, content).
 *
 * Workers equivalent: the object is read from R2 (`env.FILES`, keyed by the event's `name`; the
 * `bucket` field is only echoed). Nothing on Cloudflare emits these events by itself; whoever forwards
 * R2 event notifications (or a test client) must POST a CloudEvent in binary mode (`ce-id`,
 * `ce-source`, `ce-type`, `ce-specversion` headers + JSON body) or structured mode
 * (`application/cloudevents+json`). A malformed CloudEvent → 400 like the Java
 * `@ExceptionHandler(IllegalStateException)` (`@ResponseStatus(reason = "Invalid CloudEvent received")`).
 */
import { Hono } from "hono";
import type { AppEnv } from "../../env";
import { RuntimeException } from "../../lib/errors";

const app = new Hono<AppEnv>();

interface CloudEvent {
  id: string;
  source: string;
  type: string;
  data: string | null;
}

class InvalidCloudEvent extends Error {}

async function readCloudEvent(req: Request): Promise<CloudEvent> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.startsWith("application/cloudevents+json")) {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(await req.text());
    } catch {
      throw new InvalidCloudEvent();
    }
    if (!ev || typeof ev !== "object" || !ev.id || !ev.source || !ev.type || !ev.specversion) {
      throw new InvalidCloudEvent();
    }
    let data: string | null = null;
    if (typeof ev.data_base64 === "string") data = atob(ev.data_base64);
    else if (ev.data !== undefined && ev.data !== null) data = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data);
    return { id: String(ev.id), source: String(ev.source), type: String(ev.type), data };
  }
  const h = (n: string) => req.headers.get(n);
  if (!h("ce-id") || !h("ce-source") || !h("ce-type") || !h("ce-specversion")) throw new InvalidCloudEvent();
  const body = await req.text();
  return { id: h("ce-id")!, source: h("ce-source")!, type: h("ce-type")!, data: body === "" ? null : body };
}

/** java.time.Instant#toString: fraction omitted when zero, otherwise in groups of 3 digits. */
function instantToString(ms: number): string {
  return new Date(ms).toISOString().replace(".000Z", "Z");
}

function base64(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}

app.post("/auth/process", async (c) => {
  let cloudEvent: CloudEvent;
  try {
    cloudEvent = await readCloudEvent(c.req.raw);
  } catch (e) {
    if (e instanceof InvalidCloudEvent) {
      // Spring Boot's error body for @ResponseStatus(BAD_REQUEST, reason = "Invalid CloudEvent received").
      return c.json({ timestamp: new Date().toISOString(), status: 400, error: "Bad Request", path: c.req.path }, 400);
    }
    throw e;
  }
  console.log(`Id: ${cloudEvent.id}`);
  console.log(`Source: ${cloudEvent.source}`);
  console.log(`Type: ${cloudEvent.type}`);

  if (cloudEvent.data === null) {
    throw new RuntimeException('Cannot invoke "io.cloudevents.CloudEventData.toBytes()" because the return value of "io.cloudevents.CloudEvent.getData()" is null');
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cloudEvent.data);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Expect message object but got: " + cloudEvent.data);
  } catch (e) {
    // InvalidProtocolBufferException is a checked exception → generic 500 handler.
    throw new Error(e instanceof Error ? e.message : String(e));
  }
  const bucket = typeof data.bucket === "string" ? data.bucket : "";
  const name = typeof data.name === "string" ? data.name : "";
  const updatedMs = typeof data.updated === "string" ? Date.parse(data.updated) : 0;
  const updated = instantToString(Number.isNaN(updatedMs) ? 0 : updatedMs);

  const blob = await c.env.FILES.get(name);
  if (!blob) {
    throw new RuntimeException('Cannot invoke "com.google.cloud.storage.Blob.getBucket()" because "blob" is null');
  }
  const contentType = blob.httpMetadata?.contentType ?? null;
  const md5 = blob.checksums.md5 ? base64(blob.checksums.md5) : null;
  console.log(`=== Blob Metadata === Bucket: ${bucket} Name: ${blob.key} Size: ${blob.size} bytes Content Type: ${contentType} MD5 Hash: ${md5} Updated: ${blob.uploaded.toISOString()} Custom Metadata: ${JSON.stringify(blob.customMetadata ?? {})}`);

  const content = await blob.text();
  console.log(`=== First Line of Content === ${content.split("\n")[0]}`);

  const msg =
    `Cloud Storage object changed: ${bucket}/${name} modified at ${updated}\n` +
    `Content Type: ${contentType}\n` +
    `Size: ${blob.size} bytes\n` +
    `MD5 Hash: ${md5}\n` +
    `Content: ${content}\n`;
  console.log(msg);
  return c.text(msg, 200);
});

export default app;
