import { MAX_FUNCTION_INPUT, parseRule, ruleFits, ruleStatus, ruleSubstitution, ruleText, ruleValue, type LessonFunction } from "@sierrendipity/lesson-core";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { registerIndex, type MachineTimeline } from "../diagrams/useMachineTimeline";

export interface RulePanelProps {
  /** The lesson's function: its rule, its input box and its output box. */
  fn: LessonFunction;
  /** The view over the shared Session: the panel reads the output box and the machine state from it. */
  timeline: MachineTimeline;
  /** The x the machine started with. */
  input: number;
  onInput(x: number): void;
  /** The input cannot change now (the scene locked editing or fixed x, or a demonstration is running). */
  locked: boolean;
  /** Show the rule only: a question is open and the numbers would give the answer away. */
  hideValues?: boolean;
}

const WHOLE_NUMBER = /^-?\d{1,5}$/;

/**
 * The rule banner: the rule, then the rule with the number for x in it (`f(7) = 7·7 + 1 = 50`), then what
 * the machine holds now. It reads the shared Session through the timeline, so Step, Back and Reset update it.
 * The number typed for x counts when the student presses Enter or leaves the box, never key by key.
 */
export function RulePanel({ fn, timeline: tl, input, onInput, locked, hideValues = false }: RulePanelProps) {
  const parsed = useMemo(() => parseRule(fn.rule, fn.name), [fn.rule, fn.name]);
  const [text, setText] = useState(String(input));
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setText(String(input));
    setMessage(null);
  }, [input]);
  if (!parsed.ok) return null;
  const snapshot = tl.snapshot;
  const held = snapshot.regs[registerIndex(fn.output)]! | 0;
  const fits = ruleFits(parsed.rule, input);
  const trouble = !fits ? "too-big" : snapshot.state === "faulted" ? "fault" : tl.hitStepLimit ? "limit" : undefined;
  const commit = (leaving: boolean) => {
    const value = text.trim();
    if (value === String(input)) return setMessage(null);
    if (WHOLE_NUMBER.test(value) && Math.abs(Number(value)) <= MAX_FUNCTION_INPUT) {
      setMessage(null);
      onInput(Number(value));
      return;
    }
    setMessage(`Type a whole number from -${MAX_FUNCTION_INPUT} to ${MAX_FUNCTION_INPUT}. The number for x stays ${input}.`);
    if (leaving) setText(String(input));
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(false);
    }
  };
  return (
    <section aria-label="The rule" data-panel="rule" data-coach-id="banner:rule" className="min-w-0 space-y-2 rounded-md border-2 border-border bg-background p-3">
      <p data-rule-text className="font-mono text-base [overflow-wrap:anywhere]">
        {ruleText(parsed.rule)}
      </p>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>Number for x</span>
        <input
          data-rule-input
          aria-label={`Number for x in ${fn.name}(x)`}
          aria-describedby="rule-input-message"
          aria-invalid={message ? true : undefined}
          inputMode="numeric"
          autoComplete="off"
          readOnly={locked}
          aria-readonly={locked || undefined}
          value={text}
          onChange={(e) => {
            setText(e.currentTarget.value.slice(0, 8));
            setMessage(null);
          }}
          onKeyDown={key}
          onBlur={() => commit(true)}
          className="h-9 w-24 rounded-md border border-input bg-background px-2 text-lg tabular-nums text-foreground"
        />
      </label>
      <p id="rule-input-message" role="status" data-rule-message className="min-h-0 text-sm [overflow-wrap:anywhere]">
        {message}
      </p>
      {!hideValues && (
        <>
          <p data-rule-substitution className="font-mono text-lg font-semibold [overflow-wrap:anywhere]">
            {ruleSubstitution(parsed.rule, input)}
          </p>
          <p data-rule-status role="status" aria-live="polite" className="text-sm">
            {ruleStatus(fn.output, snapshot.state === "halted", held, fits ? ruleValue(parsed.rule, input) : 0, trouble)}
          </p>
        </>
      )}
    </section>
  );
}
