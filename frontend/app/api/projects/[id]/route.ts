import { NextRequest, NextResponse } from "next/server";
import { proxyUserJsonRequest } from "@/lib/backendProxy";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  return proxyUserJsonRequest({
    path: `/projects/${params.id}`,
    cache: "no-store",
    fallbackError: "Failed to load project",
  });
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  return proxyUserJsonRequest({
    path: `/projects/${params.id}`,
    method: "PATCH",
    body,
    fallbackError: "Failed to update project",
  });
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  return proxyUserJsonRequest({
    path: `/projects/${params.id}`,
    method: "DELETE",
    fallbackError: "Failed to delete project",
  });
}