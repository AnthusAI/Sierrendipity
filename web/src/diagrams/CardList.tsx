import { ArrowRight } from "lucide-react";
import { forwardRef } from "react";
import { cardText } from "./narrate";
import type { MachineTimeline } from "./useMachineTimeline";

/** Every card row is this tall (px) plus the gap, so the pointing hand can be placed without measuring. */
export const ROW = 40;
export const GAP = 4;
export const PITCH = ROW + GAP;

const ease = (t: number) => t * t * (3 - 2 * t);

interface Props {
  timeline: MachineTimeline;
  /** Print each card's byte address (0, 4, 8 ...) beside it. */
  addresses?: boolean;
  /** Draw the pointing hand at the program counter. */
  hand?: boolean;
}

/**
 * The cards in memory order, the hand at the program counter and, when the end is hidden, the
 * "end of the list" marker. Never draws a Stop card for a hidden end.
 */
export const CardList = forwardRef<HTMLOListElement, Props>(function CardList({ timeline: tl, addresses = false, hand = false }, ref) {
  const lastRun = tl.lastStep ? tl.lastStep.pc / 4 : -1;
  const pcIndex = tl.snapshot.pc / 4;
  const sliding = tl.from !== null && tl.from === tl.position - 1 && !tl.reducedMotion && tl.t < 1;
  // While a forward step animates, the hand slides from the card that ran to where the program counter ended up.
  const handIndex = sliding ? lastRun + (pcIndex - lastRun) * ease(tl.t) : pcIndex;
  const endReached = tl.hideEnd && tl.isAtEnd;
  return (
    <ol ref={ref} aria-label="Cards" className="relative flex flex-col pl-9" style={{ gap: GAP }}>
      {tl.words.map((word, i) => (
        <li
          key={i}
          data-card
          data-card-index={i}
          data-last-run={i === lastRun ? "true" : undefined}
          className={`flex items-center gap-3 rounded-md border px-3 text-sm whitespace-nowrap ${
            i === lastRun ? "border-foreground bg-changed text-changed-foreground font-medium" : "bg-card text-foreground"
          }`}
          style={{ height: ROW }}
        >
          {addresses && (
            <span data-address-label className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {i * 4}
            </span>
          )}
          <span>{cardText(word, i)}</span>
        </li>
      ))}
      {tl.hideEnd && (
        <li
          data-end-marker
          data-reached={String(endReached)}
          className={`flex items-center gap-3 rounded-md border border-dashed px-3 text-sm italic text-foreground ${endReached ? "bg-changed text-changed-foreground" : ""}`}
          style={{ height: ROW }}
        >
          {addresses && (
            <span data-address-label-end className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {tl.words.length * 4}
            </span>
          )}
          <span>the end of the list</span>
        </li>
      )}
      {hand && (
        <span
          role="img"
          data-pointer-hand
          data-address={pcIndex * 4}
          aria-label={`The arrow points at address ${pcIndex * 4}`}
          className="absolute left-0 top-0 flex size-8 items-center justify-center rounded-full bg-pc-mark text-pc-mark-foreground"
          style={{ transform: `translateY(${handIndex * PITCH + (ROW - 32) / 2}px)` }}
        >
          <ArrowRight aria-hidden className="size-4" />
        </span>
      )}
    </ol>
  );
});
