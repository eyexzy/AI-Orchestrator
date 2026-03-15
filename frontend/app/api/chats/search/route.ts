import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json([]);
  }

  const headers: Record<string, string> = {};
  if (ADMIN_API_KEY) headers["X-Api-Key"] = ADMIN_API_KEY;

  let res: Response;
  try {
    res = await fetch(
      `${API_URL}/chats/search?query=${encodeURIComponent(q)}&user_email=${encodeURIComponent(session.user.email)}`,
      { headers, cache: "no-store" },
    );
  } catch (err) {
    console.error("[/api/chats/search GET] Backend unreachable:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    try {
      return NextResponse.json(JSON.parse(body), { status: res.status });
    } catch {
      return NextResponse.json({ error: body || res.statusText }, { status: res.status });
    }
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}