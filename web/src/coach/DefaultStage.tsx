import { describe } from "@sierrendipity/explorer";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { coachId } from "./ids";
import type { StageControl, StageProps } from "./types";

/** `addi rd, zero, imm`: the "Put N into box" card, whose number is the one a student can spin. */
const isPut = (word: number) => (word & 0x7f) === 0x13 && ((word >>> 12) & 7) === 0 && ((word >>> 15) & 31) === 0;
const numberOf = (word: number) => word >> 20;
const withNumber = (word: number, n: number) => (((word & 0xfffff) | ((n & 0xfff) << 20)) >>> 0);

function Tip({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="tooltip" className="pointer-events-none absolute -top-7 left-0 z-10 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
      {children}
    </span>
  );
}

/**
 * A plain, accessible stand-in for the machine: cards in a list (number spinners are native inputs), boxes
 * as labelled values and Step, Back and Reset buttons. A richer stage (MachineView, CardList, ...) plugs
 * into the same `StageProps`.
 */
export function DefaultStage({ live, scene, onEditStarter, controls }: StageProps) {
  const uid = useId();
  const lockedAs = (control: StageControl) => controls.isLocked(control);
  const action = (control: "step" | "back" | "reset", can: boolean, label: string, run: () => void) => {
    const locked = lockedAs(control);
    const idle = !locked && !can;
    const tip = `${uid}-${control}`;
    return (
      <div className="relative">
        <Button
          data-coach-id={coachId.button(control)}
          variant={control === "step" ? "default" : "outline"}
          aria-disabled={locked || idle || undefined}
          aria-describedby={locked ? tip : undefined}
          className="peer aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          onClick={() => !locked && !idle && run()}
        >
          {label}
        </Button>
        {locked && <Tip id={tip}>Not yet</Tip>}
      </div>
    );
  };

  return (
    <div className="space-y-5" data-stage-scene={scene.id}>
      <section aria-label="Cards">
        <ol className="space-y-2">
          {live.cards.map((word, i) => {
            const spin = isPut(word);
            const locked = lockedAs("edit");
            const tip = `${uid}-card-${i}`;
            return (
              <li
                key={i}
                data-coach-id={coachId.card(i)}
                aria-current={live.pointer === i ? "step" : undefined}
                className={cn("flex items-center gap-3 rounded-lg border bg-card p-3 text-card-foreground", live.pointer === i && "border-pc-mark")}
              >
                <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                <span className="flex-1">{describe(word).text}</span>
                {spin && (
                  <span className="relative">
                    <input
                      type="number"
                      min={0}
                      max={2047}
                      aria-label={`Number on card ${i + 1}`}
                      aria-disabled={locked || undefined}
                      aria-describedby={locked ? tip : undefined}
                      title={locked ? "Not yet" : undefined}
                      readOnly={locked}
                      value={numberOf(word)}
                      onChange={(e) => {
                        const n = e.currentTarget.valueAsNumber;
                        if (!locked && Number.isInteger(n) && n >= 0 && n <= 2047) onEditStarter(i, withNumber(word, n));
                      }}
                      className="peer h-8 w-20 rounded-md border border-input bg-background px-2 text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                    />
                    {locked && <Tip id={tip}>Not yet</Tip>}
                  </span>
                )}
              </li>
            );
          })}
          {live.hideEnd && <li className="rounded-lg border border-dashed p-3 text-muted-foreground">The end of the list</li>}
        </ol>
      </section>

      <section aria-label="Boxes">
        <dl className="flex flex-wrap gap-3">
          {live.boxes.map((box) => (
            <div key={box.name} data-coach-id={coachId.box(box.name)} className="min-w-24 rounded-lg border bg-card p-3 text-card-foreground">
              <dt className="text-xs text-muted-foreground">Box {box.name}</dt>
              <dd className="m-0 text-2xl font-semibold tabular-nums">
                <output aria-label={`Box ${box.name} holds`}>{box.value}</output>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <div role="group" aria-label="Machine controls" className="flex gap-2">
        {action("step", live.canStep, "Step", controls.step)}
        {action("back", live.canBack, "Back", controls.back)}
        {action("reset", true, "Reset", controls.reset)}
      </div>
    </div>
  );
}
