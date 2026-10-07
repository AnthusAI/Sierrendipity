import { Minus, Plus } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
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
  /** The control is switched off for now: it keeps its place, says "Not yet" and changes nothing. */
  locked?: boolean;
  /** Show a minus and a plus button beside the number, so a beginner can see the number can change. */
  buttons?: boolean;
}

const snapUp = (value: number, step: number) => Math.floor(value / step) * step + step;
const snapDown = (value: number, step: number) => Math.ceil(value / step) * step - step;

/**
 * An accessible spin button (the WAI-ARIA pattern): a text box with role `spinbutton` that takes typed
 * whole numbers (a minus sign when `min` is negative) and Up/Down (one step), PageUp/PageDown (ten steps),
 * Home (min) and End (max). A typed number outside the limits is not applied: the box says why, and leaving
 * it shows the real value again.
 */
export function NumberSpinner({ value, min, max, step = 1, onChange, label = "number", className, locked = false, buttons = false }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const errorId = useId();
  const tipId = useId();
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

  const nudge = (to: number, name: string, hint: string, icon: ReactNode, disabled: boolean) => (
    <button
      type="button"
      aria-label={name}
      title={hint}
      disabled={disabled || locked}
      onClick={() => commit(to)}
      className="inline-flex size-6 items-center justify-center rounded border border-input bg-background align-middle text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
    </button>
  );

  return (
    <span className={cn("relative inline-block", buttons && "whitespace-nowrap")}>
      {buttons ? nudge(snapDown(value, step), "Minus", "Make the number smaller", <Minus className="size-3.5" aria-hidden />, value <= min) : null}
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
        aria-describedby={[locked ? tipId : null, valid ? null : errorId].filter(Boolean).join(" ") || undefined}
        aria-disabled={locked || undefined}
        readOnly={locked}
        title={locked ? "Not yet" : undefined}
        data-part="number"
        value={shown}
        size={Math.max(2, shown.length)}
        className={cn(
          "peer rounded border border-input bg-background px-1 text-center font-mono text-[color:var(--syntax-number)] tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          !valid && "border-destructive",
          locked && "cursor-not-allowed border-dashed opacity-60",
          className,
        )}
        onChange={(event) => {
          if (locked) return;
          const text = event.target.value.trim();
          setDraft(text);
          if (accepts(text) && Number(text) !== value) onChange(Number(text));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(event) => {
          if (locked) return;
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
      {buttons ? nudge(snapUp(value, step), "Plus", "Make the number bigger", <Plus className="size-3.5" aria-hidden />, value >= max) : null}
      {locked ? (
        <span id={tipId} role="tooltip" className="pointer-events-none absolute -top-7 left-0 z-10 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
          Not yet
        </span>
      ) : null}
      {valid ? null : (
        <span id={errorId} data-testid="number-error" data-card-hint className="ml-1 text-xs text-danger-fg">
          {rule}
        </span>
      )}
    </span>
  );
}
