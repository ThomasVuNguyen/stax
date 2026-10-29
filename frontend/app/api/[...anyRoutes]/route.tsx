/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { NextResponse } from "next/server";

import { backendFetch } from "@/utils/backendFetch";

// Force dynamic rendering to prevent caching
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const preferredRegion = "auto";

const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-cache, no-store, must-revalidate, private",
  Pragma: "no-cache",
  Expires: "0",
  "X-Cache-Status": "disabled",
};

function withNoCache(response: NextResponse) {
  for (const [key, value] of Object.entries(NO_CACHE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function handle(request: Request) {
  try {
    const relativeEndpoint = request.url.split("/api/")[1];
    const headers: Record<string, string> = {
      // Cache-busting headers
      "X-Request-Timestamp": Date.now().toString(),
      "X-Request-ID": Math.random().toString(36).substring(7),
    };
    const authorization = request.headers.get("Authorization");
    if (authorization) headers["Authorization"] = authorization;
    const contentType = request.headers.get("Content-Type");
    if (contentType) headers["Content-Type"] = contentType;

    const hasBody = !["GET", "HEAD"].includes(request.method.toUpperCase());
    const response = await backendFetch(relativeEndpoint, {
      method: request.method.toUpperCase(),
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: AbortSignal.timeout(180000), // 3 minutes timeout
    });

    const data = await readBody(response);
    if (!response.ok) {
      const body = data as { error?: string; message?: string } | string;
      const errorMessage =
        (typeof body === "object" && (body?.error || body?.message)) ||
        `Request failed with status code ${response.status}`;

      return withNoCache(
        NextResponse.json(
          { error: errorMessage, status: response.status },
          { status: response.status },
        ),
      );
    }

    return withNoCache(NextResponse.json(data));
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    const statusCode = 503;
    const errorMessage = timedOut
      ? "Request to backend timed out"
      : error?.message || "There was a problem with Next.js API route.";

    return withNoCache(
      NextResponse.json({ error: errorMessage, status: statusCode }, { status: statusCode }),
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}

export async function PUT(request: Request) {
  return handle(request);
}

export async function PATCH(request: Request) {
  return handle(request);
}
