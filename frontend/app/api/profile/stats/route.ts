import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET() {
  return proxyUserJsonRequest({
    path: "/profile/stats",
    cache: "no-store",
    fallbackError: "Failed to load account stats",
  });
}