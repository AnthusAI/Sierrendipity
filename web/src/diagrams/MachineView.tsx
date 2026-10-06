import { useRef } from "react";
import { CardList } from "./CardList";
import { BLANK, formatValue, narrate, type NumberFormat } from "./narrate";
import { TEST_CLOCK, registerIndex, type MachineTimeline } from "./useMachineTimeline";

const ease = (t: number) => t * t * (3 - 2 * t);

interface Props {
  timeline: MachineTimeline;
  /** Boxes to draw (default: the timeline's `boxes`, which defaults to a0). */
  boxes?: string[];
  /** Draw the pointing hand (default: the timeline's `pointer`, which defaults to false). */
  pointer?: boolean;
  format?: NumberFormat;
}

/** D1, the clerk and boxes: cards on the left, boxes on a desk on the right, a log of what just happened. */
export function MachineView({ timeline: tl, boxes = tl.boxes, pointer = tl.pointer, format = "signed" }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const cards = useRef<HTMLOListElement>(null);
  const desk = useRef<HTMLDivElement>(null);
  const entries = narrate(tl, format);
  const lastRd = tl.lastStep?.rd ?? null;

  // The token flies from the card that ran to the first visible box it wrote, while the clock runs.
  let token: { x: number; y: number; value: string } | null = null;
  const flying = tl.from !== null && tl.from === tl.position - 1 && !tl.reducedMotion && tl.t < 1;
  const target = tl.lastStep && boxes.find((name) => registerIndex(name) === lastRd && lastRd !== 0);
  if (flying && target && tl.lastStep && surface.current && cards.current && desk.current) {
    const origin = surface.current.getBoundingClientRect();
    const card = cards.current.querySelector<HTMLElement>(`[data-card-index="${tl.lastStep.pc / 4}"]`)?.getBoundingClientRect();
    const slot = desk.current.querySelector<HTMLElement>(`[aria-label="Box ${target}"]`)?.getBoundingClientRect();
    if (card && slot) {
      const k = ease(tl.t);
      const [x0, y0] = [card.right - origin.left, card.top + card.height / 2 - origin.top];
      const [x1, y1] = [slot.left + slot.width / 2 - origin.left, slot.top + slot.height / 2 - origin.top];
      token = { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, value: formatValue(tl.lastStep.after[lastRd!], format) };
    }
  }

  return (
    <div
      ref={surface}
      data-diagram-surface
      data-animation-t={TEST_CLOCK ? tl.t : undefined}
      className="relative rounded-lg border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-start gap-8">
        <CardList ref={cards} timeline={tl} hand={pointer} />
        <div ref={desk} className="flex flex-col gap-3">
          <p className="text-sm font-medium">The desk</p>
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
                  data-box
                  data-changed={String(changed)}
                  className={`flex h-24 w-28 flex-col items-center justify-between rounded-md border-2 px-2 py-2 ${
                    changed ? "border-foreground bg-changed text-changed-foreground" : "border-border bg-background text-foreground"
                  }`}
                >
                  <span data-box-label className="font-mono text-sm text-muted-foreground">
                    {name}
                  </span>
                  <span data-value className="text-3xl font-semibold tabular-nums">
                    {written ? formatValue(tl.snapshot.regs[reg], format) : BLANK}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <section role="log" aria-live="polite" aria-relevant="additions text" aria-label="What just happened" data-log className="mt-4 border-t pt-3 text-sm">
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
          </ol>
        )}
      </section>
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
