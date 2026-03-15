import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers: Record<string, string> = {};
  if (ADMIN_API_KEY) headers["X-Api-Key"] = ADMIN_API_KEY;

  try {
    const res = await fetch(`${API_URL}/chats/${params.id}/messages`, {
      headers,
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[/api/chats/[id]/messages GET] Backend unreachable:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}