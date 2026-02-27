import { API_URL } from "@/lib/config";

export interface GenerateParams {
  prompt: string;
  system_message?: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p?: number;
  top_k?: number;
  session_id?: string;
  // FIX #7: history was missing — any caller of this function got no
  // conversation context. Added as optional so existing call sites don't break.
  history?: Array<{ role: "user" | "assistant"; content: string }>;
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

/**
 * Replace {{variable}} placeholders in text with values from the variables map.
 */
export function resolveVariables(
  text: string,
  variables: Record<string, string>,
): string {
  let resolved = text;
  for (const [key, val] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{{${key}}}`, val || `{{${key}}}`);
  }
  return resolved;
}

/**
 * Low-level generate() helper.
 *
 * NOTE: In most cases you should prefer useChatStore().sendMessage() which
 * handles optimistic UI, chat session management, Compare Mode, and
 * Self-Consistency. Use this function only for standalone one-shot calls
 * (e.g. the /refine endpoint in MainInput).
 */
export async function generate(params: GenerateParams): Promise<GenerateResult> {
  const res = await fetch(`${API_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:         params.prompt,
      history:        params.history ?? [],   // FIX #7: always include history
      system_message: params.system_message ?? "",
      model:          params.model,
      temperature:    params.temperature,
      max_tokens:     params.max_tokens,
      top_p:          params.top_p  ?? 1.0,
      top_k:          params.top_k  ?? 40,
      stream:         false,
      session_id:     params.session_id ?? null,
    }),
  });

  if (!res.ok) {
    throw new Error(`Generate failed: ${res.status}`);
  }

  return res.json();
}