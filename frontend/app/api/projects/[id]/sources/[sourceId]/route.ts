import { NextRequest } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await props.params;
  return proxyUserJsonRequest({
    path: `/projects/${id}/sources/${sourceId}`,
    method: "DELETE",
    fallbackError: "Failed to delete source",
  });
}
