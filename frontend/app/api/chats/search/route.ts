import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json([]);
  }

  return proxyUserJsonRequest({
    path: `/chats/search?query=${encodeURIComponent(q)}`,
    cache: "no-store",
    fallbackError: "Failed to search chats",
  });
}