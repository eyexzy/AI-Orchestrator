import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  let body: { fileId: string; accessToken: string; fileName: string; mimeType: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { fileId, accessToken, mimeType } = body;

  // For Google Docs/Sheets/Slides — export as plain formats
  let url: string;
  let exportMime = mimeType;

  if (mimeType === "application/vnd.google-apps.document") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`;
    exportMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`;
    exportMime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else if (mimeType === "application/vnd.google-apps.presentation") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation`;
    exportMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[google-drive/download]", res.status, url, text);
    return NextResponse.json({ error: text || "Failed to download from Drive" }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": exportMime,
      "X-Export-Mime": exportMime,
    },
  });
}
