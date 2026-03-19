export async function readResponseError(
  res: Response,
  fallbackMessage = "Request failed",
): Promise<string> {
  const text = await res.text().catch(() => "");
  if (!text) return fallbackMessage;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;

    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error;
    }

    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail;
    }

    if (
      parsed.detail &&
      typeof parsed.detail === "object" &&
      typeof (parsed.detail as Record<string, unknown>).message === "string"
    ) {
      return String((parsed.detail as Record<string, unknown>).message);
    }
  } catch {
    return text;
  }

  return text;
}

export function getErrorMessage(
  error: unknown,
  fallbackMessage = "Request failed",
): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return fallbackMessage;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallbackMessage;
}