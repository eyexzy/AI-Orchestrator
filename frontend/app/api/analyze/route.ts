import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: "/analyze",
    method: "POST",
    body,
    fallbackError: "Failed to analyze prompt",
  });
}