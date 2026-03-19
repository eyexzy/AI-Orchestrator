import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET() {
  return proxyUserJsonRequest({
    path: "/templates",
    cache: "no-store",
    fallbackError: "Failed to load templates",
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: "/templates",
    method: "POST",
    body,
    fallbackError: "Failed to create template",
  });
}