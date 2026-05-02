import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createBackendToken } from "@/lib/backendAuth";

export const BACKEND_API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

type ProxyRequestOptions = {
  path: string;
  method?: string;
  body?: unknown;
  cache?: RequestCache;
  fallbackError?: string;
  headers?: HeadersInit;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getProxyHeaders(response: Response): Headers {
  const headers = new Headers();
  const requestId = response.headers.get("x-request-id");
  if (requestId) {
    headers.set("X-Request-ID", requestId);
  }
  return headers;
}

function normalizeErrorPayload(text: string, fallbackError: string): Record<string, unknown> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { error: fallbackError };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (!isRecord(parsed)) {
      if (typeof parsed === "string" && parsed.trim()) {
        return { error: parsed };
      }
      return { error: fallbackError };
    }

    const detail = parsed.detail;
    const detailMessage =
      typeof detail === "string"
        ? detail
        : isRecord(detail) && typeof detail.message === "string"
          ? detail.message
          : undefined;
    const error =
      typeof parsed.error === "string" && parsed.error.trim()
        ? parsed.error
        : detailMessage && detailMessage.trim()
          ? detailMessage
          : fallbackError;

    return { ...parsed, error };
  } catch {
    return { error: trimmed || fallbackError };
  }
}

export async function requestBackend(
  path: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${BACKEND_API_URL}${path}`, init);
}

export async function proxyBackendJsonResponse(
  response: Response,
  fallbackError = "Request failed",
): Promise<NextResponse> {
  const text = await response.text().catch(() => "");
  const headers = getProxyHeaders(response);

  if (!response.ok) {
    return NextResponse.json(
      normalizeErrorPayload(text, fallbackError),
      { status: response.status, headers },
    );
  }

  if (!text.trim()) {
    return NextResponse.json({}, { status: response.status, headers });
  }

  try {
    return NextResponse.json(JSON.parse(text), { status: response.status, headers });
  } catch {
    return NextResponse.json(
      { error: "Invalid backend response" },
      { status: 502, headers },
    );
  }
}

export async function getUserBackendAuthHeaders(
  baseHeaders?: HeadersInit,
): Promise<{ headers: Headers } | { response: NextResponse }> {
  const session = await auth();
  if (!session?.user?.email) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const token = await createBackendToken(session.user.email);
  const headers = new Headers(baseHeaders);
  headers.set("Authorization", `Bearer ${token}`);
  return { headers };
}

export async function proxyPublicJsonRequest({
  path,
  method = "GET",
  body,
  cache,
  fallbackError = "Request failed",
  headers,
}: ProxyRequestOptions): Promise<NextResponse> {
  const requestHeaders = new Headers(headers);
  if (body !== undefined && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", "application/json");
  }

  try {
    const response = await requestBackend(path, {
      method,
      cache: cache ?? "no-store",
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return await proxyBackendJsonResponse(response, fallbackError);
  } catch (error) {
    console.error(`[backendProxy] ${method} ${path} failed`, error);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

export async function proxyUserJsonRequest({
  path,
  method = "GET",
  body,
  cache,
  fallbackError = "Request failed",
  headers,
}: ProxyRequestOptions): Promise<NextResponse> {
  const authHeadersResult = await getUserBackendAuthHeaders(headers);
  if ("response" in authHeadersResult) {
    return authHeadersResult.response;
  }

  if (body !== undefined && !authHeadersResult.headers.has("Content-Type")) {
    authHeadersResult.headers.set("Content-Type", "application/json");
  }

  try {
    const response = await requestBackend(path, {
      method,
      cache: cache ?? "no-store",
      headers: authHeadersResult.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return await proxyBackendJsonResponse(response, fallbackError);
  } catch (error) {
    console.error(`[backendProxy] ${method} ${path} failed`, error);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
