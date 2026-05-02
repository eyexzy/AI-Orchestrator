import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: `/chat-messages/${id}/feedback`,
    method: "POST",
    body,
    fallbackError: "Failed to save message feedback",
  });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return proxyUserJsonRequest({
    path: `/chat-messages/${id}/feedback`,
    method: "DELETE",
    fallbackError: "Failed to remove message feedback",
  });
}
