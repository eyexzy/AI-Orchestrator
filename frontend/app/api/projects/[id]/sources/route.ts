import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest, getUserBackendAuthHeaders, requestBackend } from "@/lib/backendProxy";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  return proxyUserJsonRequest({
    path: `/projects/${id}/sources`,
    cache: "no-store",
    fallbackError: "Failed to load project sources",
  });
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const contentType = req.headers.get("content-type") ?? "";

  // Text source
  if (contentType.includes("application/json")) {
    return proxyUserJsonRequest({
      path: `/projects/${id}/sources/text`,
      method: "POST",
      body: await req.json(),
      fallbackError: "Failed to add text source",
    });
  }

  // File upload — parse FormData in Next.js and forward to backend
  const authResult = await getUserBackendAuthHeaders({});
  if ("response" in authResult) return authResult.response;

  const formData = await req.formData();

  const backendRes = await requestBackend(`/projects/${id}/sources/upload`, {
    method: "POST",
    headers: authResult.headers, // no Content-Type — fetch sets multipart boundary automatically
    body: formData,
  });

  if (!backendRes.ok) {
    const text = await backendRes.text().catch(() => "Upload failed");
    return NextResponse.json({ error: text }, { status: backendRes.status });
  }
  return NextResponse.json(await backendRes.json());
}
