import { NextRequest, NextResponse } from "next/server";
import { getUserBackendAuthHeaders, requestBackend } from "@/lib/backendProxy";

function cleanupTitle(value: string): string {
  return value
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\.+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function fallbackTitleFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/[`*_>#\[\]{}()]/g, " ")
    .replace(/[.!?,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean).slice(0, 5);
  const title = words.join(" ").slice(0, 80).trim();
  return title || "New Chat";
}

async function persistTitle(
  chatId: string,
  headers: HeadersInit,
  title: string,
): Promise<void> {
  await requestBackend(`/chats/${chatId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ title }),
  });
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;

  let userPrompt = "";
  let model = "gemini-2.0-flash";
  try {
    const body = await req.json();
    userPrompt = typeof body?.prompt === "string" ? body.prompt : "";
    if (typeof body?.model === "string" && body.model) model = body.model;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!userPrompt.trim()) {
    return NextResponse.json({ error: "No prompt provided" }, { status: 400 });
  }

  const authHeadersResult = await getUserBackendAuthHeaders({
    "Content-Type": "application/json",
  });
  if ("response" in authHeadersResult) {
    return authHeadersResult.response;
  }

  const systemMessage =
    "Your task: write a short chat title based on the user message below.\n" +
    "Rules:\n" +
    "- 2 to 5 words maximum\n" +
    "- Capture the core topic or intent, not the phrasing\n" +
    "- Use title case (capitalize main words)\n" +
    "- No quotes, no period at the end, no filler words like 'Help with' or 'Question about'\n" +
    "- If the message is in Ukrainian — write the title in Ukrainian\n" +
    "- Output ONLY the title, nothing else";

  const truncated = userPrompt.slice(0, 500);
  const fallbackTitle = fallbackTitleFromPrompt(userPrompt);

  try {
    const response = await requestBackend("/generate", {
      method: "POST",
      headers: authHeadersResult.headers,
      body: JSON.stringify({
        stream: false,
        model,
        prompt: truncated,
        system_message: systemMessage,
        max_tokens: 30,
        temperature: 0.2,
        history: [],
      }),
    });

    if (!response.ok) {
      await persistTitle(params.id, authHeadersResult.headers, fallbackTitle);
      return NextResponse.json({ title: fallbackTitle, fallback: true });
    }

    const data = await response.json() as Record<string, unknown>;
    const raw = (typeof data?.text === "string" ? data.text : "") as string;

    const title = cleanupTitle(raw) || fallbackTitle;

    await persistTitle(params.id, authHeadersResult.headers, title);

    return NextResponse.json({ title });
  } catch {
    try {
      await persistTitle(params.id, authHeadersResult.headers, fallbackTitle);
      return NextResponse.json({ title: fallbackTitle, fallback: true });
    } catch {
      return NextResponse.json({ title: fallbackTitle, fallback: true }, { status: 202 });
    }
  }
}
