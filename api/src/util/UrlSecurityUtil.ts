import { RuntimeException } from "../lib/errors";

/**
 * Port of util/UrlSecurityUtil (SSRF guard for custom model endpoints).
 *
 * Workers have no InetAddress, so host names are resolved with DNS-over-HTTPS (Cloudflare,
 * A + AAAA). As in Java, a resolution failure lets the URL through. The function is therefore
 * async. Java threw java.lang.IllegalArgumentException, which GlobalExceptionHandler renders via
 * its RuntimeException handler (500 RUNTIME_ERROR), so RuntimeException is thrown here.
 */

const DOH_URL = "https://cloudflare-dns.com/dns-query";
// Characters java.net.URI rejects anywhere in a URI.
const ILLEGAL_URI_CHARS = /[\s"<>\\^`{|}]/;

function fail(message: string): never {
  throw new RuntimeException(message);
}

export async function validateExternalUrl(urlString: string | null | undefined): Promise<void> {
  if (urlString === null || urlString === undefined || !urlString.trim()) return;
  const trimmed = urlString.trim();

  if (ILLEGAL_URI_CHARS.test(trimmed)) fail("Invalid URL format");
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(trimmed)?.[1];
  if (!scheme || (scheme.toLowerCase() !== "http" && scheme.toLowerCase() !== "https")) {
    fail("URL scheme must be http or https");
  }
  // Opaque URIs ("http:foo") have no host in java.net.URI.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) fail("URL host cannot be empty");

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    fail("Invalid URL format");
  }
  const host = url.hostname;
  if (!host || !host.trim()) fail("URL host cannot be empty");

  const lowerHost = host.toLowerCase();
  if (
    lowerHost.includes("metadata.google.internal") ||
    lowerHost === "metadata" ||
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost === "169.254.169.254"
  ) {
    fail("Access to internal endpoints is forbidden");
  }

  for (const addr of await resolveAll(lowerHost)) checkAddress(addr);
}

/** IP literals resolve to themselves; names go through DoH. Failures yield no addresses. */
async function resolveAll(host: string): Promise<number[][]> {
  const literal = parseIp(host);
  if (literal) return [literal];
  const out: number[][] = [];
  for (const type of ["A", "AAAA"]) {
    try {
      const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
      for (const a of body.Answer ?? []) {
        if (a.type !== 1 && a.type !== 28) continue;
        const ip = parseIp(a.data);
        if (ip) out.push(ip);
      }
    } catch {
      // UnknownHostException equivalent: allowed to proceed.
    }
  }
  return out;
}

/** Byte array of an IPv4 (4 bytes) or IPv6 (16 bytes) literal; IPv4-mapped IPv6 becomes IPv4 like InetAddress. */
function parseIp(s: string): number[] | null {
  const h = s.replace(/^\[|\]$/g, "");
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const b = v4.slice(1).map(Number);
    return b.every((x) => x <= 255) ? b : null;
  }
  if (!h.includes(":")) return null;
  let text = h.split("%")[0];
  let tail: number[] = [];
  const embedded = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (embedded) {
    const b = parseIp(embedded[2]);
    if (!b) return null;
    tail = b;
    text = embedded[1] + "0:0";
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const words = (part: string) => (part ? part.split(":") : []);
  const head = words(halves[0]);
  const rest = halves.length === 2 ? words(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  const bytes = groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 0xff];
  });
  if (tail.length) bytes.splice(12, 4, ...tail);
  // ::ffff:a.b.c.d is returned as an Inet4Address by Java.
  if (bytes.slice(0, 10).every((x) => x === 0) && bytes[10] === 0xff && bytes[11] === 0xff) return bytes.slice(12);
  return bytes;
}

function checkAddress(ip: number[]) {
  if (ip.length === 4) {
    const [first, second] = ip;
    const loopback = first === 127;
    const anyLocal = ip.every((x) => x === 0);
    const linkLocal = first === 169 && second === 254;
    const siteLocal = first === 10 || (first === 172 && (second & 0xf0) === 16) || (first === 192 && second === 168);
    if (loopback || anyLocal || linkLocal || siteLocal) fail("Access to internal IP addresses is forbidden");
    if (first === 169 && second === 254) fail("Access to link-local addresses is forbidden");
    if (first === 10) fail("Access to private network is forbidden");
    if (first === 172 && second >= 16 && second <= 31) fail("Access to private network is forbidden");
    if (first === 192 && second === 168) fail("Access to private network is forbidden");
    if (first === 127) fail("Access to loopback address is forbidden");
    return;
  }
  const loopback = ip.slice(0, 15).every((x) => x === 0) && ip[15] === 1;
  const anyLocal = ip.every((x) => x === 0);
  const linkLocal = ip[0] === 0xfe && (ip[1] & 0xc0) === 0x80;
  const siteLocal = ip[0] === 0xfe && (ip[1] & 0xc0) === 0xc0;
  if (loopback || anyLocal || linkLocal || siteLocal) fail("Access to internal IP addresses is forbidden");
}
