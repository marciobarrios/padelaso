import { afterEach, describe, expect, it, vi } from "vitest";
import { createBeforeSend } from "./sentry-options";

afterEach(() => vi.useRealTimers());

describe("Sentry error storm guard", () => {
  it("suppresses repeated failures until the next minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    const beforeSend = createBeforeSend();
    const event = {
      type: undefined,
      exception: { values: [{ type: "Error", value: "Realtime failed" }] },
    };
    expect(beforeSend(event)).toBe(event);
    expect(beforeSend({ ...event, event_id: "another-occurrence" })).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(beforeSend(event)).toBe(event);
  });

  it("caps distinct errors as well as duplicates, then recovers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01"));
    const beforeSend = createBeforeSend();
    for (let i = 0; i < 20; i += 1) {
      expect(beforeSend({ type: undefined, message: `Failure ${i}` })).not.toBeNull();
    }
    expect(beforeSend({ type: undefined, message: "Another failure" })).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(beforeSend({ type: undefined, message: "Another failure" })).not.toBeNull();
  });
});
