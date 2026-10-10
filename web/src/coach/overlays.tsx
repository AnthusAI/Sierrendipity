import { MousePointer2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { findCoachTarget } from "./ids";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const same = (a: Rect | null, b: Rect | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/** Where the element with this coach id is on screen, kept current as the page scrolls, resizes or changes. */
function useTargetRect(target: string | null, onMove?: (rect: Rect | null) => void): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const measure = (live = false) => {
    const el = target ? findCoachTarget(target) : null;
    const r = el?.getBoundingClientRect();
    const next = r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    // Move the frame in the same tick as the scroll or resize event, before React re-renders, so it never trails.
    if (live) onMove?.(next);
    setRect((prev) => (same(prev, next) ? prev : next));
    return el;
  };
  // Every render, so a layout change caused by the stage itself is followed straight away.
  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    if (!target) return;
    const el = measure();
    const observer = new ResizeObserver(() => measure());
    if (el) observer.observe(el);
    const mutations = new MutationObserver(() => measure());
    mutations.observe(document.body, { childList: true, subtree: true });
    const live = () => measure(true);
    window.addEventListener("resize", live);
    window.addEventListener("scroll", live, true);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", live);
      window.removeEventListener("scroll", live, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return target ? rect : null;
}

const PAD = 6;

/**
 * Dims everything except the target. It is a transparent frame whose huge box-shadow does the dimming, so
 * it never intercepts the pointer and never traps the keyboard: the target stays clickable and focusable.
 * Instant (no transition) under reduced motion.
 */
export function Spotlight({ target, reduced, mode = "dim" }: { target: string; reduced: boolean; mode?: "dim" | "ring" }) {
  const frame = useRef<HTMLDivElement | null>(null);
  const rect = useTargetRect(target, (next) => {
    const el = frame.current;
    if (!el || !next) return;
    // A scroll or resize moves the frame at once: a glide here would make it trail behind what it points at.
    el.style.transition = "none";
    el.style.left = `${next.x - PAD}px`;
    el.style.top = `${next.y - PAD}px`;
    el.style.width = `${next.width + 2 * PAD}px`;
    el.style.height = `${next.height + 2 * PAD}px`;
  });
  // The frame glides only when the spotlight moves to a NEW target, and only for a moment.
  useEffect(() => {
    const el = frame.current;
    if (!el || reduced) return;
    el.style.transition = "left 150ms, top 150ms, width 150ms, height 150ms";
    const timer = setTimeout(() => {
      el.style.transition = "none";
    }, 200);
    return () => clearTimeout(timer);
  }, [target, reduced, rect !== null]);
  if (!rect) return null;
  return (
    <div
      ref={frame}
      data-coach-spotlight
      data-target={target}
      data-mode={mode}
      data-motion={reduced ? "reduced" : "full"}
      aria-hidden="true"
      className="pointer-events-none fixed z-40 rounded-lg"
      style={{
        left: rect.x - PAD,
        top: rect.y - PAD,
        width: rect.width + 2 * PAD,
        height: rect.height + 2 * PAD,
        // "ring" points without dimming the page: a bold ring and a soft halo around the target.
        boxShadow:
          mode === "ring"
            ? "0 0 0 3px var(--ring), 0 0 0 9px color-mix(in srgb, var(--ring) 25%, transparent)"
            : "0 0 0 100vmax color-mix(in srgb, var(--background) 72%, transparent), 0 0 0 2px var(--ring)",
      }}
    />
  );
}

/** The ghost's pointer during Show me. It glides, or jumps under reduced motion. */
export function GhostPointer({ target, fallback, reduced }: { target: string | null; fallback: () => Rect | null; reduced: boolean }) {
  const rect = useTargetRect(target);
  const at = rect ?? fallback();
  if (!at) return null;
  return (
    <div
      data-ghost-pointer
      data-target={target ?? ""}
      data-motion={reduced ? "reduced" : "full"}
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-50 text-primary drop-shadow"
      style={{
        transform: `translate(${at.x + at.width / 2}px, ${at.y + at.height / 2}px)`,
        transition: reduced ? "none" : "transform 500ms ease-in-out",
      }}
    >
      <MousePointer2 className="size-7 fill-current" strokeWidth={1.5} />
    </div>
  );
}
