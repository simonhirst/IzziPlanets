import { onCLS, onINP, onLCP } from "web-vitals";

const RUM_ENDPOINT = import.meta.env.VITE_RUM_ENDPOINT || "";
const SESSION_KEY = "izzi.session.id.v1";

function ensureSessionId() {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `sess_${Date.now()}`;
  }
}

const sessionId = ensureSessionId();

export function emitTelemetry(eventType: string, payload: unknown) {
  const event = {
    eventType,
    sessionId,
    timestamp: new Date().toISOString(),
    page: location.pathname,
    payload,
  };

  if (!RUM_ENDPOINT) {
    if (import.meta.env.DEV) {
      console.debug("[telemetry]", event);
    }
    return;
  }

  const body = JSON.stringify(event);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(RUM_ENDPOINT, blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  fetch(RUM_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function captureError(error: unknown, context = "runtime") {
  const data = {
    context,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
  emitTelemetry("error", data);
}

export function setupWebVitals() {
  onCLS((metric) => emitTelemetry("web-vitals", metric));
  onINP((metric) => emitTelemetry("web-vitals", metric));
  onLCP((metric) => emitTelemetry("web-vitals", metric));
}

window.addEventListener("error", (event) => {
  captureError(event.error || event.message, "window.error");
});

window.addEventListener("unhandledrejection", (event) => {
  captureError(event.reason, "window.unhandledrejection");
});
