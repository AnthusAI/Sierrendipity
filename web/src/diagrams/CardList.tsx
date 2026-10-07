import { ArrowRight } from "lucide-react";
import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cardText } from "./narrate";
import { ease } from "./ease";
import type { MachineTimeline } from "./useMachineTimeline";

interface Props {
  timeline: MachineTimeline;
  /** Print each card's byte address (0, 4, 8 ...) beside it. */
  addresses?: boolean;
  /** Draw the pointing hand at the program counter. */
  hand?: boolean;
  /** Draw each card yourself (the lesson stage draws real faces with number spinners) instead of plain text. */
  renderCard?: (word: number, index: number, state: { current: boolean }) => ReactNode;
  /** Give the rows `data-coach-id="card:<n>"` so a lesson can point at them. */
  coachIds?: boolean;
  /** Show the "end of the list" row when the Stop card is hidden. Default true. */
  endMarker?: boolean;
}

interface Row {
  top: number;
  height: number;
}

const HAND = 32;
const sameRows = (a: Row[], b: Row[]) => a.length === b.length && a.every((row, i) => row.top === b[i].top && row.height === b[i].height);

/**
 * The cards in memory order, numbered from 1, with the pointing hand at the program counter and, when
 * the end is hidden, the "end of the list" marker. Cards wrap their text; the hand follows the measured
 * rows. A hidden end is never drawn as a Stop card.
 */
export const CardList = forwardRef<HTMLOListElement, Props>(function CardList({ timeline: tl, addresses = false, hand = false, renderCard, coachIds = false, endMarker = true }, forwarded) {
  const list = useRef<HTMLOListElement | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const measure = useCallback(() => {
    const next = [...(list.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])].map((row) => ({ top: row.offsetTop, height: row.offsetHeight }));
    setRows((prev) => (sameRows(prev, next) ? prev : next));
  }, []);
  useLayoutEffect(measure);
  useEffect(() => {
    if (!list.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(list.current);
    return () => observer.disconnect();
  }, [measure]);

  const lastRun = tl.lastStep ? tl.lastStep.pc / 4 : -1;
  const pcIndex = tl.snapshot.pc / 4;
  const sliding = tl.from !== null && tl.from === tl.position - 1 && !tl.reducedMotion && tl.t < 1;
  const center = (index: number) => (rows[index] ? rows[index].top + rows[index].height / 2 : index * 44 + 20);
  // While a forward step animates, the hand slides from the card that ran to where the program counter ended up.
  const handY = sliding ? center(lastRun) + (center(pcIndex) - center(lastRun)) * ease(tl.t) : center(pcIndex);
  const endReached = tl.hideEnd && tl.endHidden && tl.isAtEnd;

  return (
    <ol
      ref={(el) => {
        list.current = el;
        if (typeof forwarded === "function") forwarded(el);
        else if (forwarded) forwarded.current = el;
      }}
      aria-label="Cards"
      className="relative flex min-w-0 flex-col gap-1 pl-10"
    >
      {tl.words.map((word, i) => (
        <li
          key={i}
          data-row
          data-card
          data-card-index={i}
          data-coach-id={coachIds ? `card:${i}` : undefined}
          aria-current={i === lastRun ? "true" : undefined}
          className={
            renderCard
              ? "flex min-h-10 items-start gap-3 rounded-md border border-transparent py-1 text-sm"
              : `flex min-h-10 items-start gap-3 rounded-md border px-3 py-2 text-sm ${
                  i === lastRun ? "border-foreground bg-changed font-medium text-changed-foreground" : "bg-card text-foreground"
                }`
          }
        >
          <span data-card-number className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          {addresses && (
            <span data-address-label className="w-7 shrink-0 text-right font-mono text-xs leading-5 tabular-nums text-muted-foreground">
              {i * 4}
            </span>
          )}
          {renderCard ? <span className="min-w-0 flex-1">{renderCard(word, i, { current: i === lastRun })}</span> : <span className="min-w-0 break-words">{cardText(word)}</span>}
        </li>
      ))}
      {tl.hideEnd && endMarker && (
        <li
          data-row
          data-end-marker
          data-reached={String(endReached)}
          className={`flex min-h-10 items-start gap-3 rounded-md border border-dashed px-3 py-2 text-sm italic ${
            endReached ? "bg-changed text-changed-foreground" : "text-foreground"
          }`}
        >
          <span className="w-4 shrink-0" />
          {addresses && (
            <span data-address-label-end className="w-7 shrink-0 text-right font-mono text-xs leading-5 tabular-nums text-muted-foreground">
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
          className="absolute left-0 top-0 flex items-center justify-center rounded-full bg-pc-mark text-pc-mark-foreground"
          style={{ width: HAND, height: HAND, transform: `translateY(${handY - HAND / 2}px)` }}
        >
          <ArrowRight aria-hidden className="size-4" />
        </span>
      )}
    </ol>
  );
});
