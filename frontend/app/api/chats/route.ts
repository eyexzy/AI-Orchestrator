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
  let project_id: string | null | undefined;
  try {
    const body = await req.json();
    if (body?.title) {
      title = body.title;
    }
    if ("project_id" in (body ?? {})) {
      project_id = body.project_id ?? null;
    }
  } catch {
  }

  return proxyUserJsonRequest({
    path: "/chats",
    method: "POST",
    body: { title, project_id },
    fallbackError: "Failed to create chat",
  });
}