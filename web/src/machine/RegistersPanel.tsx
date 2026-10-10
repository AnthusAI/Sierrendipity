import { BLANK, formatValue, type NumberFormat } from "../diagrams/narrate";
import { registerIndex, type MachineTimeline } from "../diagrams/useMachineTimeline";

export interface RegistersPanelProps {
  /** The view over the shared Session: the panel reads registers and the last written register from it. */
  timeline: MachineTimeline;
  /** The registers to draw, by ABI name. Default: the timeline's `boxes`. */
  only?: string[];
  format?: NumberFormat;
  /** Give each box `data-coach-id="box:<name>"` so a scene can spotlight it. */
  coachIds?: boolean;
  /** False draws "box" instead of the register name, and the screen reader hears "The box". */
  names?: boolean;
  /** While a new value is flying in, the box keeps showing this old value. */
  holdOld?: number | null;
}

/** The Registers panel in the lesson "boxes" skin: one box per register, the one just written is marked. */
export function RegistersPanel({ timeline: tl, only = tl.boxes, format = "signed", coachIds = false, names = true, holdOld = null }: RegistersPanelProps) {
  const lastRd = tl.lastStep?.rd ?? null;
  return (
    <div role="group" aria-label={names ? "Registers" : "Boxes"} data-panel="registers" className="flex min-w-0 flex-wrap gap-3">
      {only.map((name) => {
        const reg = registerIndex(name);
        const written = tl.written.has(reg);
        const changed = lastRd === reg && reg !== 0;
        return (
          <div
            key={name}
            role="group"
            aria-label={names ? `Box ${name}` : "The box"}
            aria-current={changed ? "true" : undefined}
            data-box
            data-box-name={name}
            data-coach-id={coachIds ? `box:${name}` : undefined}
            data-changed={String(changed)}
            className={`flex h-24 w-28 max-w-full flex-col items-center justify-between rounded-md border-2 px-2 py-2 ${
              changed ? "border-foreground bg-changed text-changed-foreground" : "border-border bg-background text-foreground"
            }`}
          >
            <span data-box-label className="font-mono text-sm text-muted-foreground">
              {names ? name : "box"}
            </span>
            <span data-value aria-hidden={written ? undefined : true} className="text-3xl font-semibold tabular-nums">
              {holdOld !== null && changed ? formatValue(holdOld, format) : written ? formatValue(tl.snapshot.regs[reg], format) : BLANK}
            </span>
            {!written && <span className="sr-only">empty</span>}
          </div>
        );
      })}
    </div>
  );
}
