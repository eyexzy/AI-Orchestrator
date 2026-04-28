import { NextRequest, NextResponse } from "next/server";
import { getUserBackendAuthHeaders, BACKEND_API_URL, proxyBackendJsonResponse } from "@/lib/backendProxy";

export async function POST(req: NextRequest) {
  const authResult = await getUserBackendAuthHeaders();
  if ("response" in authResult) return authResult.response;

  // Forward the raw multipart body — do NOT set Content-Type so the
  // boundary from the original request is preserved by fetch.
  const contentType = req.headers.get("content-type") ?? "";
  const headers = new Headers(authResult.headers);
  if (contentType) headers.set("Content-Type", contentType);

  let response: Response;
  try {
    response = await fetch(`${BACKEND_API_URL}/files/upload`, {
      method: "POST",
      headers,
      body: req.body,
      // @ts-expect-error — duplex required for streaming body in Node 18+
      duplex: "half",
    });
  } catch (error) {
    console.error("[/api/files POST] Backend unreachable:", error);
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  return proxyBackendJsonResponse(response, "File upload failed");
}
