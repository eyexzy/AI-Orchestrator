import { NextRequest, NextResponse } from "next/server";
import {
  getUserBackendAuthHeaders,
  proxyBackendJsonResponse,
  proxyUserJsonRequest,
  requestBackend,
} from "@/lib/backendProxy";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;

  if (payload.stream !== true) {
    return proxyUserJsonRequest({
      path: "/generate",
      method: "POST",
      body: payload,
      fallbackError: "Failed to generate response",
    });
  }

  const authHeadersResult = await getUserBackendAuthHeaders({
    "Content-Type": "application/json",
  });
  if ("response" in authHeadersResult) {
    return authHeadersResult.response;
  }

  try {
    const response = await requestBackend("/generate", {
      method: "POST",
      headers: authHeadersResult.headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return proxyBackendJsonResponse(response, "Failed to generate response");
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      response.headers.get("content-type") ?? "text/event-stream",
    );
    headers.set("Cache-Control", "no-cache, no-transform");
    const requestId = response.headers.get("x-request-id");
    if (requestId) {
      headers.set("X-Request-ID", requestId);
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("[/api/generate POST] Backend unreachable:", error);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}