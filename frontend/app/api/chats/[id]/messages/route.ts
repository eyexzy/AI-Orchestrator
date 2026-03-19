import { NextRequest } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  return proxyUserJsonRequest({
    path: `/chats/${params.id}/messages`,
    cache: "no-store",
    fallbackError: "Failed to load chat messages",
  });
}