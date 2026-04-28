import { NextRequest } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
  }

  return proxyUserJsonRequest({
    path: `/chats/${params.id}/fork`,
    method: "POST",
    body,
    fallbackError: "Failed to fork chat",
  });
}