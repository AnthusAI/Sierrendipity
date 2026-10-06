import { describe } from "@sierrendipity/explorer";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { coachId } from "./ids";
import type { StageControl, StageProps } from "./types";

/** `addi rd, zero, imm`: the "Put N into box" card, whose number is the one a student can spin. */
const isPut = (word: number) => (word & 0x7f) === 0x13 && ((word >>> 12) & 7) === 0 && ((word >>> 15) & 31) === 0;
const numberOf = (word: number) => word >> 20;
const withNumber = (word: number, n: number) => (((word & 0xfffff) | ((n & 0xfff) << 20)) >>> 0);

const MAX = 2047;
const RULE = `a number from 0 to ${MAX}`;
const valid = (text: string): number | null => (/^\s*\d{1,5}\s*$/.test(text) && Number(text) <= MAX ? Number(text.trim()) : null);

function Tip({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="tooltip" className="pointer-events-none absolute -top-7 left-0 z-10 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
      {children}
    </span>
  );
}

/**
 * A number a student can change. It keeps what they type as a draft: a valid number is applied at once, and
 * anything else (empty, minus, too big) is never thrown away silently: the card keeps its last good number
 * and says what a good one looks like.
 */
function NumberField({ value, label, locked, tip, onCommit }: { value: number; label: string; locked: boolean; tip: string; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    // The card changed from outside (a reset, the ghost): show it.
    setDraft((d) => (valid(d) === value ? d : String(value)));
  }, [value]);
  const noteFor = (text: string) => (valid(text) === null ? `Use ${RULE}. The card keeps ${value} until then.` : null);
  const commit = (text: string) => {
    const n = valid(text);
    setNote(noteFor(text));
    if (n !== null && n !== value) onCommit(n);
  };
  const bump = (by: number) => {
    const n = Math.min(MAX, Math.max(0, (valid(draft) ?? value) + by));
    setDraft(String(n));
    commit(String(n));
  };
  const describedBy = [locked ? tip : null, note ? `${tip}-note` : null].filter(Boolean).join(" ") || undefined;
  return (
    <span className="relative flex flex-col items-end gap-1">
      <input
        type="text"
        inputMode="numeric"
        role="spinbutton"
        aria-valuemin={0}
        aria-valuemax={MAX}
        aria-valuenow={value}
        aria-label={label}
        aria-disabled={locked || undefined}
        aria-invalid={note ? true : undefined}
        aria-describedby={describedBy}
        title={locked ? "Not yet" : undefined}
        readOnly={locked}
        value={draft}
        onChange={(e) => {
          if (locked) return;
          setDraft(e.currentTarget.value);
          commit(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (locked) return;
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            bump(e.key === "ArrowUp" ? 1 : -1);
          } else if (e.key === "Enter") commit(draft);
        }}
        onBlur={() => {
          // Leaving with something unusable puts the last good number back, and says so.
          if (valid(draft) === null) {
            setNote(noteFor(draft));
            setDraft(String(value));
          }
        }}
        className="peer h-8 w-20 rounded-md border border-input bg-background px-2 text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      />
      {locked && <Tip id={tip}>Not yet</Tip>}
      {note && (
        <span id={`${tip}-note`} role="status" data-card-hint className="text-xs text-muted-foreground">
          {note}
        </span>
      )}
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
  const action = (control: "step" | "back" | "reset", can: boolean, label: string, why: string, run: () => void) => {
    const locked = lockedAs(control);
    const idle = !locked && !can;
    const tip = `${uid}-${control}`;
    return (
      <div className="relative flex flex-col items-start gap-1">
        <Button
          data-coach-id={coachId.button(control)}
          variant={control === "step" && !idle ? "default" : "outline"}
          aria-disabled={locked || idle || undefined}
          aria-describedby={locked ? tip : idle ? `${tip}-why` : undefined}
          className={cn("peer", (locked || idle) && "cursor-not-allowed border-dashed text-muted-foreground")}
          onClick={() => !locked && !idle && run()}
        >
          {label}
        </Button>
        {locked && <Tip id={tip}>Not yet</Tip>}
        {idle && (
          <span id={`${tip}-why`} data-idle-note className="text-xs text-muted-foreground">
            {why}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5" data-stage-scene={scene.id}>
      <section aria-label="Cards">
        <ol className="space-y-2">
          {live.cards.map((word, i) => (
            <li
              key={i}
              data-coach-id={coachId.card(i)}
              aria-current={live.pointer === i ? "step" : undefined}
              className={cn("flex items-start gap-3 rounded-lg border bg-card p-3 text-card-foreground", live.pointer === i && "border-pc-mark")}
            >
              <span className="w-5 pt-1 text-right text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="flex-1 pt-1">{describe(word).text}</span>
              {isPut(word) && <NumberField value={numberOf(word)} label={`Number on card ${i + 1}`} locked={lockedAs("edit")} tip={`${uid}-card-${i}`} onCommit={(n) => onEditStarter(i, withNumber(word, n))} />}
            </li>
          ))}
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

      <div role="group" aria-label="Machine controls" className="flex flex-wrap items-start gap-2">
        {action("step", live.canStep, "Step", "Press Back first", controls.step)}
        {action("back", live.canBack, "Back", "Nothing to undo yet", controls.back)}
        {action("reset", true, "Reset", "", controls.reset)}
      </div>
    </div>
  );
}
