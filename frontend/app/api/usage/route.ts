import { NextRequest } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET(_req: NextRequest) {
  return proxyUserJsonRequest({
    path: "/profile/usage",
    method: "GET",
    fallbackError: "Failed to fetch usage",
  });
}
