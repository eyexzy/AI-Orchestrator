import { NextRequest, NextResponse } from "next/server";
import { getUserBackendAuthHeaders, requestBackend } from "@/lib/backendProxy";

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
      return NextResponse.json({ error: "LLM error" }, { status: 502 });
    }

    const data = await response.json() as Record<string, unknown>;
    const raw = (typeof data?.text === "string" ? data.text : "") as string;

    const title = raw.replace(/^["']|["']$/g, "").replace(/\.+$/, "").trim().slice(0, 80);

    if (!title) {
      return NextResponse.json({ error: "Empty title generated" }, { status: 502 });
    }

    // Persist title to backend
    await requestBackend(`/chats/${params.id}`, {
      method: "PATCH",
      headers: authHeadersResult.headers,
      body: JSON.stringify({ title }),
    });

    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
  }
}
