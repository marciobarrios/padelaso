import type { ErrorEvent } from "@sentry/nextjs";

// Bound both repeated failures and storms of distinct errors per runtime/tab.
// This is intentionally in-memory: a new server instance gets a fresh budget.
export function createBeforeSend() {
  let windowStartedAt = 0;
  let sent = 0;
  const seen = new Set<string>();

  return (event: ErrorEvent): ErrorEvent | null => {
    const now = Date.now();
    if (now - windowStartedAt >= 60_000) {
      windowStartedAt = now;
      sent = 0;
      seen.clear();
    }
    const exception = event.exception?.values?.[0];
    const key = JSON.stringify([
      event.fingerprint,
      exception?.type,
      exception?.value ?? event.message,
      exception?.stacktrace?.frames?.slice(-3),
    ]);
    if (sent >= 20 || seen.has(key)) return null;
    seen.add(key);
    sent += 1;
    return event;
  };
}

export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  sendDefaultPii: false,
  beforeSend: createBeforeSend(),
};
