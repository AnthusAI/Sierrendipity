import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BitLamps } from "./BitLamps";
import { clampWidth } from "./bits";
import { useReducedMotion } from "./motion";

export interface BinaryCounterProps {
  /** How many lamps (default 8). */
  width?: number;
  /** "Make this number" mode: the student sets the lamps; done when they add up to `target`. */
  target?: number;
  /** Called once each time the lamps come to match `target`. */
  onDone?: () => void;
  /** Count by itself (default true). With reduced motion it never counts by itself and offers no Play
   *  button: only Step (and Reset) move the counter. */
  autoplay?: boolean;
  /** Milliseconds between counts. */
  intervalMs?: number;
  /** The accessible name of the widget. */
  label?: string;
}

/** A small demo: lamps that count up while the student watches, or a "make this number" puzzle. */
export function BinaryCounter({ width: requestedWidth = 8, target, onDone, autoplay = true, intervalMs = 700, label }: BinaryCounterProps) {
  const reduced = useReducedMotion();
  const width = clampWidth(requestedWidth);
  const [value, setValue] = useState(0);
  const [moved, setMoved] = useState(false);
  const [running, setRunning] = useState(autoplay && !reduced && target === undefined);
  const range = 2 ** width;
  const counting = target === undefined;

  useEffect(() => {
    if (reduced) setRunning(false);
  }, [reduced]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setValue((v) => (v + 1) % range), intervalMs);
    return () => clearInterval(timer);
  }, [running, intervalMs, range]);

  const reachable = target === undefined || (Number.isInteger(target) && target >= 0 && target < range);
  // "Done" needs the student to have set the lamps: a target of 0 must not be done on arrival.
  const done = target !== undefined && reachable && moved && value === target;
  const announced = useRef(false);
  useEffect(() => {
    if (done && !announced.current) onDone?.();
    announced.current = done;
  }, [done, onDone]);

  return (
    <div role="group" aria-label={label ?? (counting ? "Binary counter" : "Make this number")} className="space-y-3">
      {target !== undefined && <p className="text-sm font-medium">{`Make the lamps add up to ${target}`}</p>}
      <BitLamps
        label={counting ? "Counter lamps" : "Lamps to set"}
        value={value}
        width={width}
        onChange={counting ? undefined : (v) => { setValue(v); setMoved(true); }}
        readOnly={counting}
      />
      {!reachable && (
        <p role="status" className="text-sm">{`That number cannot be made with ${width} lamps. Try a whole number from 0 to ${range - 1}.`}</p>
      )}
      {done && (
        <p role="status" className="rounded-md bg-success-bg px-3 py-1.5 text-sm font-medium text-success-fg">
          {`Done! The lamps add up to ${target}.`}
        </p>
      )}
      <div className="flex gap-2">
        {counting && (
          <>
            {!reduced && (
              <Button variant="secondary" size="sm" onClick={() => setRunning((r) => !r)}>
                {running ? "Pause" : "Play"}
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setValue((v) => (v + 1) % range)}>
              Step
            </Button>
          </>
        )}
        <Button variant="secondary" size="sm" onClick={() => { setValue(0); setMoved(false); }}>
          Reset
        </Button>
      </div>
    </div>
  );
}
