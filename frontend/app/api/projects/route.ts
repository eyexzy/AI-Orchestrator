import { NextRequest } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET() {
  return proxyUserJsonRequest({
    path: "/projects",
    cache: "no-store",
    fallbackError: "Failed to load projects",
  });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
  }

  return proxyUserJsonRequest({
    path: "/projects",
    method: "POST",
    body,
    fallbackError: "Failed to create project",
  });
}