import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET() {
  return proxyUserJsonRequest({
    path: "/profile/preferences",
    cache: "no-store",
    fallbackError: "Failed to load preferences",
  });
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: "/profile/preferences",
    method: "PATCH",
    body,
    fallbackError: "Failed to save preferences",
  });
}