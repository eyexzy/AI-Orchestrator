import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET() {
  return proxyUserJsonRequest({
    path: "/profile/activity",
    cache: "no-store",
    fallbackError: "Failed to load profile activity",
  });
}
