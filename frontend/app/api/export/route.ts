import { NextResponse } from "next/server";
import { auth } from "@/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized — please sign in first" },
      { status: 401 },
    );
  }

  if (!ADMIN_API_KEY) {
    console.warn(
      "[/api/export] ADMIN_API_KEY is not set in the Next.js environment.\n" +
      "  If your FastAPI backend has ADMIN_API_KEY set, add the same value to\n" +
      "  .env.local as ADMIN_API_KEY (no NEXT_PUBLIC_ prefix).\n" +
      "  Example:  ADMIN_API_KEY=your_secret_here",
    );
  }

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

  if (!backendRes.ok) {
    if (backendRes.status === 401) {
      const hint = ADMIN_API_KEY
        ? "ADMIN_API_KEY mismatch between Next.js and FastAPI"
        : "ADMIN_API_KEY is missing from Next.js .env.local";

      console.error(
        `[/api/export] FastAPI returned 401 — ${hint}.\n` +
        "  Fix: add ADMIN_API_KEY=<same value as in backend .env> to .env.local\n" +
        "  then restart the Next.js dev server.",
      );
      return NextResponse.json(
        { error: "missing_admin_key" },
        { status: 503 },
      );
    }

    const text = await backendRes.text().catch(() => "");
    try {
      return NextResponse.json(JSON.parse(text), { status: backendRes.status });
    } catch {
      return NextResponse.json(
        { error: text || backendRes.statusText },
        { status: backendRes.status },
      );
    }
  }

  const csv = await backendRes.text();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="interaction_logs.csv"',
      "Cache-Control": "no-store",
    },
  });
}