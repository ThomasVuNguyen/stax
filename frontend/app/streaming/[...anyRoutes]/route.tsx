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

import { NextRequest } from "next/server";

import { backendFetch } from "@/utils/backendFetch";

// Force dynamic rendering to prevent caching
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";
export const runtime = "nodejs";
export const preferredRegion = "auto";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Connection: "keep-alive",
};

function errorStream(error: string) {
  return new Response(`data:${JSON.stringify({ error })}\n`, { headers: SSE_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const relativeEndpoint = request.url.split("/streaming/")[1];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };

    // Forward authorization header if present
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    try {
      const response = await backendFetch(relativeEndpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      // Handle non-200 status codes
      if (response.status !== 200 || !response.body) {
        return errorStream(`Backend error: ${response.status}`);
      }

      // Forward the backend's Server-Sent Events as they arrive
      return new Response(response.body, { headers: SSE_HEADERS });
    } catch (error) {
      return errorStream(
        `Request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: "Streaming route error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
