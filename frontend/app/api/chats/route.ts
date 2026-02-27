/**
 * app/api/chats/route.ts
 *
 * Server-side proxy for FastAPI /chats endpoints.
 *
 * SECURITY
 * ────────
 * 1. auth() verifies the NextAuth JWT — unauthenticated → 401.
 * 2. user_email is taken from the SERVER session, never from the client.
 * 3. ADMIN_API_KEY is injected as X-Api-Key so FastAPI can verify the caller.
 *
 *   Browser  ──►  /api/chats  (this file)
 *                     │
 *                     │  adds X-Api-Key + trusted user_email
 *                     ▼
 *               FastAPI /chats
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

// ── GET /api/chats — list chats for the authenticated user ───────────────────
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers: Record<string, string> = {};
  if (ADMIN_API_KEY) headers["X-Api-Key"] = ADMIN_API_KEY;

  try {
    const res = await fetch(
      `${API_URL}/chats?user_email=${encodeURIComponent(session.user.email)}`,
      { headers, cache: "no-store" },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/chats GET] Backend unreachable:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}

// ── POST /api/chats — create a new chat for the authenticated user ───────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read optional title from client body, but always override user_email
  let title = "Новий чат";
  try {
    const body = await req.json();
    if (body?.title) title = body.title;
  } catch {
    /* empty body is fine — use defaults */
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ADMIN_API_KEY) headers["X-Api-Key"] = ADMIN_API_KEY;

  try {
    const res = await fetch(`${API_URL}/chats`, {
      method: "POST",
      headers,
      body: JSON.stringify({ user_email: session.user.email, title }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/chats POST] Backend unreachable:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}