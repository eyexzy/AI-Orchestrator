const STORAGE_VERSION = 1;

interface PersistedEnvelope<T> {
  version: number;
  data: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function makeScopedStorageKey(baseKey: string, scope?: string | null): string {
  const normalizedScope = scope?.trim().toLowerCase();
  if (!normalizedScope || normalizedScope === "anonymous") {
    return baseKey;
  }
  return `${baseKey}:${encodeURIComponent(normalizedScope)}`;
}

export function readPersistedState<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.version === "number" && "data" in parsed) {
      if (parsed.version !== STORAGE_VERSION) {
        return null;
      }
      return parsed.data as T;
    }

    return parsed as T;
  } catch {
    return null;
  }
}

export function writePersistedState<T>(key: string, data: T | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (data === null) {
      window.localStorage.removeItem(key);
      return;
    }

    const envelope: PersistedEnvelope<T> = {
      version: STORAGE_VERSION,
      data,
    };
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
  }
}
