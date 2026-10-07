import { MousePointer2 } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { findCoachTarget } from "./ids";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const same = (a: Rect | null, b: Rect | null) => a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/** Where the element with this coach id is on screen, kept current as the page scrolls, resizes or changes. */
function useTargetRect(target: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  const measure = () => {
    const el = target ? findCoachTarget(target) : null;
    const r = el?.getBoundingClientRect();
    const next = r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
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
    const observer = new ResizeObserver(measure);
    if (el) observer.observe(el);
    const mutations = new MutationObserver(measure);
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
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
  const rect = useTargetRect(target);
  if (!rect) return null;
  return (
    <div
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
        transition: reduced ? "none" : "left 150ms, top 150ms, width 150ms, height 150ms",
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
