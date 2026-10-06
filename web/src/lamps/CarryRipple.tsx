import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./lamps.css";
import { bitLength, isLit, isWord } from "./bits";
import { useReducedMotion } from "./motion";

export interface CarryStep {
  column: number;
  a: 0 | 1;
  b: 0 | 1;
  carryIn: 0 | 1;
  out: 0 | 1;
  carryOut: 0 | 1;
  /** "column 1: 0 + 1 + 1 (carry in) = 0 carry 1" */
  text: string;
}

/** Every column of a + b, right to left, as plain data (also the text trace). */
export function carrySteps(a: number, b: number): CarryStep[] {
  const columns = bitLength(a + b);
  const steps: CarryStep[] = [];
  let carry: 0 | 1 = 0;
  for (let column = 0; column < columns; column++) {
    const x = (isLit(a, column) ? 1 : 0) as 0 | 1;
    const y = (isLit(b, column) ? 1 : 0) as 0 | 1;
    const sum = x + y + carry;
    const out = (sum % 2) as 0 | 1;
    const carryOut = (sum > 1 ? 1 : 0) as 0 | 1;
    const sums = `${x} + ${y}${carry ? " + 1 (carry in)" : ""}`;
    steps.push({ column, a: x, b: y, carryIn: carry, out, carryOut, text: `column ${column}: ${sums} = ${out} carry ${carryOut}` });
    carry = carryOut;
  }
  return steps;
}

export interface CarryRippleProps {
  a: number;
  b: number;
  /** The accessible name of the widget. */
  label?: string;
  /** Milliseconds between columns while playing. */
  intervalMs?: number;
}

/**
 * Adding two small binary numbers one column at a time with the carry hopping left.
 * The state is just "how many columns are done", so it works with animation off as a text trace.
 */
export function CarryRipple({ a, b, label, intervalMs = 700 }: CarryRippleProps) {
  const reduced = useReducedMotion();
  const valid = isWord(a) && isWord(b);
  const steps = useMemo(() => (valid ? carrySteps(a, b) : []), [a, b, valid]);
  const columns = steps.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [a, b]);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setStep((s) => Math.min(columns, s + 1)), intervalMs);
    return () => clearInterval(timer);
  }, [playing, intervalMs, columns]);

  useEffect(() => {
    if (step >= columns) setPlaying(false);
  }, [step, columns]);

  const play = () => {
    if (reduced) {
      setStep(columns);
      return;
    }
    if (step >= columns) setStep(0);
    setPlaying((p) => !p);
  };

  const shown = steps.slice(0, step);
  const current = shown[shown.length - 1];
  const cols = Array.from({ length: columns }, (_, i) => columns - 1 - i);
  const answer = a + b;
  const cell = "h-8 w-8 text-center font-mono text-base";

  if (!valid) {
    return (
      <div role="group" aria-label={label ?? "Carry ripple"} className="min-w-0 max-w-full">
        <p className="text-sm">Carry ripple needs whole numbers from 0 to 4294967295</p>
      </div>
    );
  }

  return (
    <div role="group" aria-label={label ?? `Carry ripple ${a} + ${b}`} className="min-w-0 max-w-full space-y-3">
      <div data-scroll-x className="overflow-x-auto">
      <table aria-label={`Adding ${a} and ${b} in binary`} className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th scope="row" className="pr-2 text-right text-xs font-normal text-muted-foreground">column</th>
            {cols.map((c) => (
              <th key={c} scope="col" className="w-8 text-center font-mono text-xs font-normal text-muted-foreground">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="pr-2 text-right text-xs font-normal text-muted-foreground">carry</th>
            {cols.map((c) => {
              const carried = c > 0 && step >= c && steps[c - 1]!.carryOut === 1;
              const hopping = c > 0 && step === c && carried;
              return (
                <td key={c} className={cn(cell, "rounded font-bold", hopping && !reduced && "carry-hop")}>
                  {carried ? "1" : ""}
                </td>
              );
            })}
          </tr>
          {[
            { name: `${a}`, bit: (c: number) => (isLit(a, c) ? "1" : "0") },
            { name: `+ ${b}`, bit: (c: number) => (isLit(b, c) ? "1" : "0") },
          ].map((row) => (
            <tr key={row.name}>
              <th scope="row" className="pr-2 text-right text-sm font-normal">{row.name}</th>
              {cols.map((c) => (
                <td key={c} className={cn(cell, "border-b", c === current?.column && "bg-accent")}>{row.bit(c)}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" className="pr-2 text-right text-sm font-normal">answer</th>
            {cols.map((c) => (
              <td key={c} className={cn(cell, "font-semibold", c === current?.column && "bg-accent")}>
                {c < step ? steps[c]!.out : ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No steps yet</p>
      ) : (
        <ol aria-label="Trace" aria-live="polite" className="space-y-0.5 font-mono text-sm">
          {shown.map((s) => (
            <li key={s.column}>{s.text}</li>
          ))}
        </ol>
      )}

      {step >= columns && (
        <p role="status" aria-label="Answer" className="text-sm font-medium">
          {`Answer: ${a} + ${b} = ${answer} (${answer.toString(2)} in binary)`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Previous step
        </Button>
        <Button variant="secondary" size="sm" disabled={step >= columns} onClick={() => setStep((s) => Math.min(columns, s + 1))}>
          Next step
        </Button>
        <Button variant="secondary" size="sm" onClick={play}>
          {playing ? "Pause" : "Play"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => { setPlaying(false); setStep(0); }}>
          Start over
        </Button>
      </div>
    </div>
  );
}
