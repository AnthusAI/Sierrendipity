import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /** Spoken name; with the value it announces as "number, 5". */
  label?: string;
  className?: string;
}

/**
 * An accessible spin button (the WAI-ARIA pattern): a text box with role `spinbutton` that takes typed
 * digits and Up/Down (1), PageUp/PageDown (10), Home (min) and End (max). A typed number outside the
 * limits is not applied; leaving the box shows the real value again.
 */
export function NumberSpinner({ value, min, max, onChange, label = "number", className }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const valid = draft === null || (/^\d+$/.test(draft) && Number(draft) >= min && Number(draft) <= max);

  const commit = (next: number) => {
    setDraft(null);
    const clamped = Math.min(max, Math.max(min, next));
    if (clamped !== value) onChange(clamped);
  };

  return (
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
        if (/^\d+$/.test(text) && Number(text) >= min && Number(text) <= max && Number(text) !== value) onChange(Number(text));
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(event) => {
        const step: Record<string, number | undefined> = { ArrowUp: value + 1, ArrowDown: value - 1, PageUp: value + 10, PageDown: value - 10, Home: min, End: max };
        const next = step[event.key];
        if (next === undefined) return;
        event.preventDefault();
        commit(next);
      }}
    />
  );
}
