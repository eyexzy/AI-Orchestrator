import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ADMIN_API_KEY) headers["X-Api-Key"] = ADMIN_API_KEY;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/templates/${params.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[/api/templates/[id] PUT] Backend unreachable:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const headers: Record<string, string> = {};
  if (ADMIN_API_KEY) headers["X-Api-Key"] = ADMIN_API_KEY;

  let res: Response;
  try {
    res = await fetch(`${API_URL}/templates/${params.id}`, {
      method: "DELETE",
      headers,
    });
  } catch (err) {
    console.error("[/api/templates/[id] DELETE] Backend unreachable:", err);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    try {
      return NextResponse.json(JSON.parse(text), { status: res.status });
    } catch {
      return NextResponse.json({ error: text || res.statusText }, { status: res.status });
    }
  }

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}