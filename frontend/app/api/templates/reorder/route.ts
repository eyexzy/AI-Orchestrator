import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: "/templates/reorder",
    method: "PUT",
    body,
    fallbackError: "Failed to reorder templates",
  });
}