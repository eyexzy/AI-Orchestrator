/**
 * app/api/export/route.ts
 *
 * Server-side proxy for the FastAPI /export-csv endpoint.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The old approach read NEXT_PUBLIC_ADMIN_API_KEY on the client, which
 * baked the secret into the browser bundle — anyone with DevTools could
 * steal it. This route handler keeps ADMIN_API_KEY strictly server-side:
 *
 *   Browser  ──►  /api/export  (this file, runs on the Node server)
 *                     │
 *                     │  adds "X-Api-Key: <secret>" header
 *                     ▼
 *               FastAPI /export-csv
 *
 * SECURITY CHECKS
 * ───────────────
 * 1. Session check — only authenticated users can trigger an export.
 *    Unauthenticated requests get 401 before we ever touch the backend.
 * 2. The ADMIN_API_KEY env var is never exposed to the client.
 *    Remove NEXT_PUBLIC_ADMIN_API_KEY from .env.local entirely.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Backend URL — falls back to localhost in development.
const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

// Secret key for the FastAPI admin endpoints — never exposed to the browser.
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

export async function GET() {
  // ── 1. Auth guard ──────────────────────────────────────────────────────────
  // auth() reads the JWT from the cookie on the server; no token = no export.
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized — please sign in first" },
      { status: 401 },
    );
  }

  // ── 2. Early check: warn loudly if the key is absent but FastAPI requires it.
  // We cannot know for sure whether FastAPI has ADMIN_API_KEY set without
  // making a request, but we can at least surface a clear hint in the logs
  // so the developer knows exactly what to add to .env.local.
  if (!ADMIN_API_KEY) {
    console.warn(
      "[/api/export] ADMIN_API_KEY is not set in the Next.js environment.\n" +
      "  If your FastAPI backend has ADMIN_API_KEY set, add the same value to\n" +
      "  .env.local as ADMIN_API_KEY (no NEXT_PUBLIC_ prefix).\n" +
      "  Example:  ADMIN_API_KEY=your_secret_here",
    );
    // Do NOT abort here — if the backend also has no key set (dev default),
    // the request will still succeed. We only abort after a real 401 below.
  }

  // ── 3. Forward request to FastAPI with the secret key ──────────────────────
  const headers: Record<string, string> = {};
  if (ADMIN_API_KEY) {
    headers["X-Api-Key"] = ADMIN_API_KEY;
  }

  let backendRes: Response;
  try {
    backendRes = await fetch(`${API_URL}/export-csv`, {
      headers,
      cache: "no-store",
    });
  } catch (err) {
    console.error("[/api/export] Backend unreachable:", err);
    return NextResponse.json(
      { error: "Backend unreachable" },
      { status: 502 },
    );
  }

  // ── 4. Relay FastAPI errors back to the caller ─────────────────────────────
  if (!backendRes.ok) {
    if (backendRes.status === 401) {
      // The backend has ADMIN_API_KEY set but Next.js does not (or has a
      // different value). Give an actionable message to the developer without
      // leaking the secret to the browser.
      const hint = ADMIN_API_KEY
        ? "ADMIN_API_KEY mismatch between Next.js and FastAPI"
        : "ADMIN_API_KEY is missing from Next.js .env.local";

      console.error(
        `[/api/export] FastAPI returned 401 — ${hint}.\n` +
        "  Fix: add ADMIN_API_KEY=<same value as in backend .env> to .env.local\n" +
        "  then restart the Next.js dev server.",
      );
      return NextResponse.json(
        // Safe message for the browser — no internal details.
        { error: "missing_admin_key" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: `Backend error: ${backendRes.status}` },
      { status: backendRes.status },
    );
  }

  // ── 4. Stream the CSV body straight to the browser ─────────────────────────
  const csv = await backendRes.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interaction_logs.csv"',
      // Prevent the browser from caching sensitive data.
      "Cache-Control": "no-store",
    },
  });
}