type EventPayload = Record<string, unknown>;

interface QueuedEvent {
  event_type: string;
  session_id: string | null;
  chat_id: string | null;
  event_context: EventPayload;
  payload: EventPayload;
}

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 50;

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionIdAccessor: (() => string) | null = null;
let chatIdAccessor: (() => string | null) | null = null;

/** Register accessors so the tracker can read current session/chat IDs lazily. */
export function initEventTracker(opts: {
  getSessionId: () => string;
  getChatId: () => string | null;
}) {
  sessionIdAccessor = opts.getSessionId;
  chatIdAccessor = opts.getChatId;

  if (!flushTimer) {
    flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", flushEventsSync);
    }
  }
}

/** Queue a behavioral event. Cheap to call — no network until flush. */
export function trackEvent(
  eventType: string,
  payload: EventPayload = {},
  context: EventPayload = {},
) {
  queue.push({
    event_type: eventType,
    session_id: sessionIdAccessor?.() ?? null,
    chat_id: chatIdAccessor?.() ?? null,
    event_context: context,
    payload,
  });

  if (queue.length >= MAX_BATCH_SIZE) {
    flushEvents();
  }
}

/** Flush queued events to backend via the batch endpoint. */
export async function flushEvents(): Promise<void> {
  if (queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH_SIZE);

  try {
    await fetch("/api/events/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
  } catch {
    // Put events back on failure so they can retry on next flush
    queue.unshift(...batch);
  }
}

/** Synchronous best-effort flush for beforeunload. */
function flushEventsSync() {
  if (queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH_SIZE);
  const body = JSON.stringify({ events: batch });

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    const sent = navigator.sendBeacon("/api/events/batch", blob);
    if (!sent) {
      queue.unshift(...batch);
    }
  }
}