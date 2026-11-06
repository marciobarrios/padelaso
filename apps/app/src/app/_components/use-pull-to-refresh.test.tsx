import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePullToRefresh } from "./use-pull-to-refresh";

function Harness({ onRefresh, enabled = true }: { onRefresh: () => Promise<unknown>; enabled?: boolean }) {
  const { containerRef, indicatorRef, status, refresh } = usePullToRefresh(onRefresh, enabled);
  return (
    <div ref={containerRef} data-testid="surface">
      <div ref={indicatorRef} />
      <p role="status">{status}</p>
      <button onClick={() => void refresh()}>Actualizar</button>
      <div data-testid="nested" style={{ overflowY: "auto" }}>Nested list</div>
    </div>
  );
}

const touch = (x: number, y: number) => ({ clientX: x, clientY: y });
function start(target = screen.getByTestId("surface")) {
  fireEvent.touchStart(target, { touches: [touch(100, 100)] });
}
function move(x: number, y: number) {
  const event = new Event("touchmove", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: [touch(x, y)] });
  fireEvent(screen.getByTestId("surface"), event);
  return event;
}
function end() {
  fireEvent.touchEnd(screen.getByTestId("surface"), { touches: [] });
}

afterEach(() => vi.unstubAllGlobals());

describe("home pull to refresh", () => {
  it("arms at the threshold, refreshes only on release, and blocks duplicate requests", async () => {
    let finish!: () => void;
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<Harness onRefresh={refresh} />);
    start();
    expect(move(100, 140).defaultPrevented).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("pulling");
    move(100, 180);
    expect(screen.getByRole("status").textContent).toBe("ready");
    expect(refresh).not.toHaveBeenCalled();
    end();
    expect(screen.getByRole("status").textContent).toBe("refreshing");
    fireEvent.click(screen.getByRole("button"));
    start(); move(100, 220); end();
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(screen.getByRole("status").textContent).toBe("success");
  });

  it.each(["short", "reversed", "horizontal", "upward", "canceled", "multitouch"])("does not refresh a %s gesture", (kind) => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<Harness onRefresh={refresh} />);
    start();
    if (kind === "short") move(100, 179);
    if (kind === "reversed") { move(100, 200); move(100, 140); }
    if (kind === "horizontal") { expect(move(200, 110).defaultPrevented).toBe(false); move(100, 220); }
    if (kind === "upward") { expect(move(100, 90).defaultPrevented).toBe(false); move(100, 220); }
    if (kind === "canceled") { move(100, 220); fireEvent.touchCancel(screen.getByTestId("surface")); }
    if (kind === "multitouch") {
      move(100, 220);
      fireEvent.touchStart(screen.getByTestId("surface"), { touches: [touch(100, 220), touch(200, 220)] });
    }
    end();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("requires a new gesture after scrolling to the top and leaves nested scrollers alone", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<Harness onRefresh={refresh} />);
    vi.stubGlobal("scrollY", 50);
    start();
    vi.stubGlobal("scrollY", 0);
    expect(move(100, 220).defaultPrevented).toBe(false);
    end();
    const ancestor = container;
    ancestor.scrollTop = 30;
    start(); move(100, 220); end();
    ancestor.scrollTop = 0;
    const nested = screen.getByTestId("nested");
    Object.defineProperty(nested, "scrollHeight", { value: 200 });
    start(nested); move(100, 220); end();
    start(screen.getByRole("button")); move(100, 220); end();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports errors and allows a retry from the keyboard-accessible button", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    render(<Harness onRefresh={refresh} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("error"));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("success"));
  });

  it("only suppresses native overscroll while the home gesture is enabled", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { rerender, unmount } = render(<Harness onRefresh={refresh} enabled={false} />);
    expect(document.documentElement.classList.contains("home-pull-to-refresh")).toBe(false);
    start(); move(100, 220); end();
    expect(refresh).not.toHaveBeenCalled();
    rerender(<Harness onRefresh={refresh} />);
    expect(document.documentElement.classList.contains("home-pull-to-refresh")).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("home-pull-to-refresh")).toBe(false);
  });
});
