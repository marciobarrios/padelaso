"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

const THRESHOLD = 80;
type Status = "idle" | "pulling" | "ready" | "refreshing" | "success" | "error";

export function usePullToRefresh(onRefresh: () => Promise<unknown>, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const [status, setStatus] = useState<Status>("idle");

  function paint(distance: number, tracking = false) {
    const indicator = indicatorRef.current;
    if (!indicator) return;
    indicator.style.transitionDuration = tracking ? "0ms" : "180ms";
    indicator.style.transform = `translateY(${Math.min(distance, 104) - 44}px)`;
    indicator.style.opacity = String(Math.min(distance / 32, 1));
  }

  async function refresh() {
    if (busy.current || !enabled) return;
    busy.current = true;
    setStatus("refreshing");
    paint(THRESHOLD);
    try {
      await onRefresh();
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      busy.current = false;
      paint(0);
    }
  }

  const refreshFromGesture = useEffectEvent(() => void refresh());

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    let start: { x: number; y: number } | null = null;
    let distance = 0;
    let pulling = false;
    let ready = false;

    // The home uses document scrolling today; also respect scrollable ancestors.
    function atTop() {
      if (window.scrollY > 0) return false;
      for (let node: HTMLElement | null = container; node; node = node.parentElement) {
        if (node.scrollTop > 0) return false;
      }
      return true;
    }

    function cancel() {
      start = null;
      distance = 0;
      if (pulling && !busy.current) {
        paint(0);
        setStatus("idle");
      }
      pulling = ready = false;
    }

    function onStart(event: TouchEvent) {
      cancel();
      if (busy.current || event.touches.length !== 1 || !atTop()) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("button, input, textarea, select, [contenteditable], [role=dialog]")) return;
      // Nested scrollers keep their own touch gestures, even at their top edge.
      for (let node: Element | null = target; node && node !== container; node = node.parentElement) {
        if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return;
      }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    }

    function onMove(event: TouchEvent) {
      if (!start) return;
      if (event.touches.length !== 1 || !atTop()) return cancel();
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = Math.abs(touch.clientX - start.x);
      if (!pulling && (dy < 0 || dx > Math.abs(dy))) return cancel();
      if (dy <= 0) return cancel();
      // A non-passive listener takes ownership before native overscroll begins.
      if (!event.cancelable) return cancel();
      event.preventDefault();
      distance = dy;
      paint(Math.min(dy, THRESHOLD) + Math.max(0, dy - THRESHOLD) * 0.2, true);
      const nextReady = dy >= THRESHOLD;
      if (!pulling || nextReady !== ready) setStatus(nextReady ? "ready" : "pulling");
      pulling = true;
      ready = nextReady;
    }

    function onEnd() {
      const shouldRefresh = pulling && distance >= THRESHOLD;
      cancel();
      if (shouldRefresh) refreshFromGesture();
    }

    document.documentElement.classList.add("home-pull-to-refresh");
    container.addEventListener("touchstart", onStart, { passive: true });
    container.addEventListener("touchmove", onMove, { passive: false });
    container.addEventListener("touchend", onEnd);
    container.addEventListener("touchcancel", cancel);
    return () => {
      document.documentElement.classList.remove("home-pull-to-refresh");
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove", onMove);
      container.removeEventListener("touchend", onEnd);
      container.removeEventListener("touchcancel", cancel);
    };
  }, [enabled]);

  return { containerRef, indicatorRef, status, refresh, refreshing: status === "refreshing" };
}
