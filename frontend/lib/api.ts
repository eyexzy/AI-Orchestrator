export interface GenerateParams {
  prompt: string;
  system_message?: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p?: number;
  session_id?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  continuation_text?: string;
  continuation_message_id?: number;
}

export interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model: string;
  temperature: number;
  latency_ms: number;
}

export interface GenerateResult {
  text: string;
  usage: UsageStats;
  raw: Record<string, unknown>;
  provider: string;
}

export function resolveVariables(
  text: string,
  variables: Record<string, string>,
): string {
  let resolved = text;
  for (const [key, val] of Object.entries(variables)) {
    if (val && val.includes(`{{${key}}}`)) continue;
    resolved = resolved.replaceAll(`{{${key}}}`, val || `{{${key}}}`);
  }
  return resolved;
}

export async function generate(params: GenerateParams): Promise<GenerateResult> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:         params.prompt,
      history:        params.history ?? [],
      system_message: params.system_message ?? "",
      model:          params.model,
      temperature:    params.temperature,
      max_tokens:     params.max_tokens,
      top_p:          params.top_p  ?? 1.0,
      stream:         false,
      session_id:     params.session_id ?? null,
      continuation_text: params.continuation_text ?? "",
      continuation_message_id: params.continuation_message_id ?? null,
    }),
  });

  if (!res.ok) {
    throw new Error(`Generate failed: ${res.status}`);
  }

  return res.json();
}
