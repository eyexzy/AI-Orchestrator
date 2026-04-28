import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function DELETE() {
  return proxyUserJsonRequest({
    path: "/profile/account",
    method: "DELETE",
    fallbackError: "Failed to delete account",
  });
}