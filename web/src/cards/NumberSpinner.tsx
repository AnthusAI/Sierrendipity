import { useId, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  min: number;
  max: number;
  /** Arrows move by this much and typed numbers must be a multiple of it (default 1). */
  step?: number;
  onChange: (value: number) => void;
  /** Spoken name; with the value it announces as "number, 5". */
  label?: string;
  className?: string;
}

const snapUp = (value: number, step: number) => Math.floor(value / step) * step + step;
const snapDown = (value: number, step: number) => Math.ceil(value / step) * step - step;

/**
 * An accessible spin button (the WAI-ARIA pattern): a text box with role `spinbutton` that takes typed
 * whole numbers (a minus sign when `min` is negative) and Up/Down (one step), PageUp/PageDown (ten steps),
 * Home (min) and End (max). A typed number outside the limits is not applied: the box says why, and leaving
 * it shows the real value again.
 */
export function NumberSpinner({ value, min, max, step = 1, onChange, label = "number", className }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const errorId = useId();
  const shown = draft ?? String(value);
  const accepts = (text: string) => {
    if (!(min < 0 ? /^-?\d+$/ : /^\d+$/).test(text)) return false;
    const n = Number(text);
    return n >= min && n <= max && n % step === 0;
  };
  const valid = draft === null || accepts(draft);
  const rule = `Use a whole number from ${min} to ${max}${step > 1 ? ` in steps of ${step}` : ""}.`;

  const commit = (next: number) => {
    setDraft(null);
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <>
      <input
        role="spinbutton"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-invalid={valid ? undefined : true}
        aria-describedby={valid ? undefined : errorId}
        data-part="number"
        value={shown}
        size={Math.max(2, shown.length)}
        className={cn(
          "rounded border border-input bg-background px-1 text-center font-mono text-[color:var(--syntax-number)] tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          !valid && "border-destructive",
          className,
        )}
        onChange={(event) => {
          const text = event.target.value.trim();
          setDraft(text);
          if (accepts(text) && Number(text) !== value) onChange(Number(text));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          const target: Record<string, number | undefined> = {
            ArrowUp: snapUp(value, step),
            ArrowDown: snapDown(value, step),
            PageUp: snapUp(value, step) + 9 * step,
            PageDown: snapDown(value, step) - 9 * step,
            Home: min,
            End: max,
          };
          const next = target[event.key];
          if (next === undefined) return;
          event.preventDefault();
          commit(next);
        }}
      />
      {valid ? null : (
        <span id={errorId} data-testid="number-error" className="ml-1 text-xs text-danger-fg">
          {rule}
        </span>
      )}
    </>
  );
}
