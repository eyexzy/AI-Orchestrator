import { NextRequest, NextResponse } from "next/server";
import { proxyPublicJsonRequest } from "@/lib/backendProxy";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request_json" }, { status: 400 });
  }

  return proxyPublicJsonRequest({
    path: "/prompt-suggestions",
    method: "POST",
    body,
    fallbackError: "prompt_suggestions_unavailable",
  });
}
