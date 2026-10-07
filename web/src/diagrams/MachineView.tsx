import { useRef, type ComponentProps } from "react";
import { CardList } from "./CardList";
import { ease } from "./ease";
import { BLANK, formatValue, narrate, stopNotice, type NumberFormat } from "./narrate";
import { Notice } from "./Notice";
import { TEST_CLOCK, registerIndex, type MachineTimeline } from "./useMachineTimeline";

interface Props {
  timeline: MachineTimeline;
  /** Boxes to draw (default: the timeline's `boxes`, which defaults to a0). */
  boxes?: string[];
  /** Draw the pointing hand (default: the timeline's `pointer`, which defaults to false). */
  pointer?: boolean;
  format?: NumberFormat;
  /** Draw each card yourself (the lesson stage draws real faces with spinners). */
  renderCard?: ComponentProps<typeof CardList>["renderCard"];
  /** Give the diagram, the cards and the boxes `data-coach-id`s (`diagram:D1`, `card:<n>`, `tab:cards`, `box:<name>`, `tab:boxes`). */
  coachIds?: boolean;
  /** Leave parts of the machine out until a lesson needs them. Every part is shown unless set to false. */
  quiet?: { log?: boolean; deskTitle?: boolean; endMarker?: boolean; boxNames?: boolean };
  /** Put the desk under the cards at every width (the lesson stage is only about 30rem wide next to the coach). */
  stacked?: boolean;
}

/** D1, the clerk and boxes: cards on the left, boxes on a desk on the right, a log of what just happened. */
export function MachineView({ timeline: tl, boxes = tl.boxes, pointer = tl.pointer, format = "signed", renderCard, coachIds = false, stacked = false, quiet }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const cards = useRef<HTMLOListElement>(null);
  const desk = useRef<HTMLDivElement>(null);
  const entries = narrate(tl, format);
  const limitNotice = tl.hitStepLimit ? stopNotice(tl) : null;
  const lastRd = tl.lastStep?.rd ?? null;

  // The token flies from the card that ran to the first visible box it wrote, while the clock runs.
  let token: { x: number; y: number; value: string } | null = null;
  // When the new value lands on a box that held a value, the old value is knocked out of the box.
  let holdOld: number | null = null;
  let knocked: { x: number; y: number; value: string; k: number } | null = null;
  const flying = tl.from !== null && tl.from === tl.position - 1 && !tl.reducedMotion && tl.t < 1;
  const target = tl.lastStep && lastRd !== null && lastRd !== 0 ? boxes.find((name) => registerIndex(name) === lastRd) : undefined;
  if (flying && target && tl.lastStep && surface.current && cards.current && desk.current) {
    const origin = surface.current.getBoundingClientRect();
    const row = cards.current.querySelector<HTMLElement>(`[data-card-index="${tl.lastStep.pc / 4}"]`);
    const card = row?.getBoundingClientRect();
    // The value starts at the number written on the card; a card with no number sends it from its right edge.
    const number = row?.querySelector<HTMLElement>('[data-part="number"]')?.getBoundingClientRect();
    const slot = desk.current.querySelector<HTMLElement>(`[aria-label="Box ${target}"]`)?.getBoundingClientRect();
    if (card && slot) {
      const k = ease(tl.t);
      const [x0, y0] = number
        ? [number.left + number.width / 2 - origin.left, number.top + number.height / 2 - origin.top]
        : [card.right - origin.left, card.top + card.height / 2 - origin.top];
      const [x1, y1] = [slot.left + slot.width / 2 - origin.left, slot.top + slot.height / 2 - origin.top];
      token = { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, value: formatValue(tl.lastStep.after[lastRd!], format) };
      const old = tl.lastStep.before[lastRd!];
      if (old !== 0 && old !== tl.lastStep.after[lastRd!] && k <= 0.55) holdOld = old;
      if (old !== 0 && old !== tl.lastStep.after[lastRd!] && k > 0.55) {
        // The hit lands at k = 0.55; the old value then flies out to the right, spinning and fading.
        const out = (k - 0.55) / 0.45;
        knocked = { x: x1 + out * 110, y: y1 - Math.sin(out * Math.PI) * 50 + out * out * 60, value: formatValue(old, format), k: out };
      }
    }
  }

  return (
    <div
      ref={surface}
      data-diagram-surface
      data-coach-id={coachIds ? "diagram:D1" : undefined}
      data-animation-t={TEST_CLOCK ? tl.t : undefined}
      className="relative space-y-4 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div className={stacked ? "flex flex-col gap-4" : "flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8"}>
        <div data-coach-id={coachIds ? "tab:cards" : undefined} className={stacked ? "min-w-0" : "min-w-0 sm:w-[26rem] sm:max-w-full sm:shrink-0"}>
          <CardList ref={cards} timeline={tl} hand={pointer} renderCard={renderCard} coachIds={coachIds} endMarker={quiet?.endMarker !== false} />
        </div>
        <div ref={desk} data-coach-id={coachIds ? "tab:boxes" : undefined} className="flex min-w-0 flex-col gap-3">
          {quiet?.deskTitle !== false && <p className="text-sm font-medium">The desk</p>}
          <div className="flex flex-wrap gap-3">
            {boxes.map((name) => {
              const reg = registerIndex(name);
              const written = tl.written.has(reg);
              const changed = lastRd === reg && reg !== 0;
              return (
                <div
                  key={name}
                  role="group"
                  aria-label={`Box ${name}`}
                  aria-current={changed ? "true" : undefined}
                  data-box
                  data-coach-id={coachIds ? `box:${name}` : undefined}
                  data-changed={String(changed)}
                  className={`flex h-24 w-28 flex-col items-center justify-between rounded-md border-2 px-2 py-2 ${
                    changed ? "border-foreground bg-changed text-changed-foreground" : "border-border bg-background text-foreground"
                  }`}
                >
                  <span data-box-label className="font-mono text-sm text-muted-foreground">
                    {quiet?.boxNames === false ? "box" : name}
                  </span>
                  <span data-value aria-hidden={written ? undefined : true} className="text-3xl font-semibold tabular-nums">
                    {holdOld !== null && changed ? formatValue(holdOld, format) : written ? formatValue(tl.snapshot.regs[reg], format) : BLANK}
                  </span>
                  {!written && <span className="sr-only">empty</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Notice timeline={tl} />
      <section role="log" aria-live="polite" aria-relevant="additions" aria-label="What just happened" data-log hidden={quiet?.log === false} className="border-t pt-3 text-sm">
        <h3 className="mb-1 font-medium">What just happened</h3>
        {entries.length === 0 ? (
          <p>Nothing has happened yet.</p>
        ) : (
          <ol className="space-y-0.5">
            {entries.map((entry) => (
              <li key={entry.step} className={entry.step === tl.position ? "font-medium" : ""}>
                {entry.sentences.join(" ")}
              </li>
            ))}
            {limitNotice && <li key="limit">{limitNotice}</li>}
          </ol>
        )}
      </section>
      <p role="status" data-announce className="sr-only">
        {tl.announcement}
      </p>
      {knocked && (
        <span
          data-knocked-out
          className="pointer-events-none absolute left-0 top-0 rounded-md border-2 border-foreground bg-card px-3 py-1 text-2xl font-semibold tabular-nums text-foreground shadow"
          style={{ transform: `translate(${knocked.x}px, ${knocked.y}px) translate(-50%, -50%) rotate(${knocked.k * 540}deg)`, opacity: 1 - knocked.k * 0.9 }}
        >
          {knocked.value}
        </span>
      )}
      {token && (
        <span
          data-token
          data-t={tl.t}
          className="pointer-events-none absolute left-0 top-0 rounded-md bg-primary px-3 py-1 text-lg font-semibold tabular-nums text-primary-foreground shadow"
          style={{ transform: `translate(${token.x}px, ${token.y}px) translate(-50%, -50%)` }}
        >
          {token.value}
        </span>
      )}
    </div>
  );
}
