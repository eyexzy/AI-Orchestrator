import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: `/chats/${params.id}`,
    method: "PATCH",
    body,
    fallbackError: "Failed to update chat",
  });
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  return proxyUserJsonRequest({
    path: `/chats/${params.id}`,
    method: "DELETE",
    fallbackError: "Failed to delete chat",
  });
}