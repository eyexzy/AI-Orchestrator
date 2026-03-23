import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET() {
  return proxyUserJsonRequest({
    path: "/profile/dashboard",
    cache: "no-store",
    fallbackError: "Failed to load dashboard data",
  });
}