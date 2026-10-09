import { parseRule, ruleStatus, ruleSubstitution, ruleText, ruleValue, type LessonFunction } from "@sierrendipity/lesson-core";
import { useEffect, useMemo, useState } from "react";
import { registerIndex, type MachineTimeline } from "../diagrams/useMachineTimeline";

export interface RulePanelProps {
  /** The lesson's function: its rule, its input box and its output box. */
  fn: LessonFunction;
  /** The view over the shared Session: the panel reads the output box and the machine state from it. */
  timeline: MachineTimeline;
  /** The x the machine started with. */
  input: number;
  onInput(x: number): void;
  /** The input cannot change now (the scene locked editing, or a demonstration is running). */
  locked: boolean;
}

/**
 * The rule banner: the rule, then the rule with the number for x in it (`f(7) = 7·7 + 1 = 50`), then what
 * the machine holds now. It reads the shared Session through the timeline, so Step, Back and Reset update it.
 */
export function RulePanel({ fn, timeline: tl, input, onInput, locked }: RulePanelProps) {
  const parsed = useMemo(() => parseRule(fn.rule, fn.name), [fn.rule, fn.name]);
  const [text, setText] = useState(String(input));
  useEffect(() => setText(String(input)), [input]);
  if (!parsed.ok) return null;
  const finished = tl.snapshot.state === "halted";
  const held = tl.snapshot.regs[registerIndex(fn.output)]! | 0;
  const edit = (next: string) => {
    setText(next);
    if (/^-?\d{1,5}$/.test(next.trim())) onInput(Number(next));
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
          inputMode="numeric"
          autoComplete="off"
          readOnly={locked}
          aria-readonly={locked || undefined}
          value={text}
          onChange={(e) => edit(e.currentTarget.value.slice(0, 6))}
          onBlur={() => setText(String(input))}
          className="h-9 w-24 rounded-md border border-input bg-background px-2 text-lg tabular-nums text-foreground"
        />
      </label>
      <p data-rule-substitution className="font-mono text-lg font-semibold [overflow-wrap:anywhere]">
        {ruleSubstitution(parsed.rule, input)}
      </p>
      <p data-rule-status role="status" aria-live="polite" className="text-sm">
        {ruleStatus(fn.output, finished, held, ruleValue(parsed.rule, input))}
      </p>
    </section>
  );
}
