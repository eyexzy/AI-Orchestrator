import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function DELETE() {
  return proxyUserJsonRequest({
    path: "/profile/chats",
    method: "DELETE",
    fallbackError: "Failed to delete chats",
  });
}