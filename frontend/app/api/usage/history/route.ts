import { NextRequest } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = searchParams.get("days") ?? "30";
  const page = searchParams.get("page") ?? "1";
  const page_size = searchParams.get("page_size") ?? "10";
  return proxyUserJsonRequest({
    path: `/profile/usage/history?days=${days}&page=${page}&page_size=${page_size}`,
    method: "GET",
    fallbackError: "Failed to fetch usage history",
  });
}
