import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const afterId = req.nextUrl.searchParams.get("after_id");

  if (!afterId) {
    return NextResponse.json({ error: "after_id is required" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: `/chats/${params.id}/messages/truncate?after_id=${encodeURIComponent(afterId)}`,
    method: "DELETE",
    fallbackError: "Failed to truncate chat history",
  });
}