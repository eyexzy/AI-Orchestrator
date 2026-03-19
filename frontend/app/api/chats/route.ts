import { NextRequest } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET() {
  return proxyUserJsonRequest({
    path: "/chats",
    cache: "no-store",
    fallbackError: "Failed to load chats",
  });
}

export async function POST(req: NextRequest) {
  let title = "New Chat";
  try {
    const body = await req.json();
    if (body?.title) {
      title = body.title;
    }
  } catch {
  }

  return proxyUserJsonRequest({
    path: "/chats",
    method: "POST",
    body: { title },
    fallbackError: "Failed to create chat",
  });
}