import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import type { LessonEngine, PlayerState } from "./engine";
import type { LessonInfo } from "../lessons";
import { coachId, findCoachTarget } from "./ids";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const TYPING = ["INPUT", "TEXTAREA", "SELECT"];

/** A whole number with an optional minus sign and surrounding spaces; anything else is not a number. */
export const parseWholeNumber = (text: string): number | null => (/^\s*-?\d{1,9}\s*$/.test(text) ? Number(text.trim()) : null);

/**
 * When a question appears (a nudge, "Skip the tour?", the 12-minute note), move focus to its button so a
 * keyboard or screen reader user meets it, unless the student is typing; give focus back when it goes.
 */
function useFocusOnAppear(active: boolean, selector: string) {
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (active) {
      const current = document.activeElement as HTMLElement | null;
      if (current && TYPING.includes(current.tagName)) return;
      previous.current = current;
      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    } else if (previous.current) {
      const back = previous.current;
      previous.current = null;
      const current = document.activeElement;
      if ((!current || current === document.body) && back.isConnected) back.focus({ preventScroll: true });
    }
    // Only when the question appears or goes away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

/** A double-click's second click lands on whatever the first one revealed: help is never spent by it. */
const single = (run: () => void) => (e: MouseEvent) => {
  if (e.detail <= 1) run();
};

function NumberAsk({ state, engine }: { state: PlayerState; engine: LessonEngine }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const ask = state.ask!;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() === "") return setMessage("Type your guess first.");
    const n = parseWholeNumber(text);
    if (n === null) return setMessage("Type a whole number, like 12.");
    setMessage(null);
    engine.answer(n);
    setText("");
  };
  const edit = (next: string) => {
    setText(next.slice(0, 12));
    setMessage(null);
  };
  return (
    <form data-coach-ask onSubmit={submit} className="space-y-2" aria-label="Your prediction">
      <p id="coach-question" className="font-medium">
        {ask.question}
      </p>
      <input
        data-coach-primary
        aria-label="Your answer"
        aria-describedby="coach-question coach-answer-hint"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => edit(e.currentTarget.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-lg tabular-nums text-foreground"
      />
      <p id="coach-answer-hint" role="status" data-coach-answer-hint className="min-h-5 text-sm">
        {message}
      </p>
      <div role="group" aria-label="Number pad" className="grid grid-cols-5 gap-1">
        {PAD.map((d) => (
          <Button key={d} variant="outline" aria-label={d} className="h-11" onClick={() => edit(text + d)}>
            {d}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="h-11 md:h-8">
          Answer
        </Button>
        <Button variant="outline" aria-label="Delete the last digit" className="h-11 md:h-8" onClick={() => edit(text.slice(0, -1))}>
          Delete
        </Button>
      </div>
    </form>
  );
}

function AskUi({ state, engine }: { state: PlayerState; engine: LessonEngine }) {
  const ask = state.ask;
  if (!ask) return null;
  if (ask.kind === "number") return <NumberAsk state={state} engine={engine} />;
  if (ask.kind === "choice")
    return (
      <div data-coach-ask role="group" aria-label={ask.question} className="space-y-2">
        <p className="font-medium">{ask.question}</p>
        <div className="flex flex-wrap gap-2">
          {ask.choices.map((choice, i) => (
            <Button key={choice} data-coach-primary={i === 0 || undefined} variant="outline" onClick={() => engine.answer(i)}>
              {choice}
            </Button>
          ))}
        </div>
      </div>
    );
  if (ask.kind === "machine-query")
    return (
      <div data-coach-ask className="space-y-2">
        <p className="font-medium">{ask.question}</p>
        <Button data-coach-primary onClick={() => engine.checkQuery()}>
          Check
        </Button>
      </div>
    );
  return (
    <div data-coach-ask className="space-y-2">
      <p className="font-medium">{ask.question}</p>
      <p className="text-muted-foreground">Select the part you mean.</p>
    </div>
  );
}

interface Props {
  state: PlayerState;
  engine: LessonEngine;
  next?: LessonInfo | null;
  onNext?: (id: string) => void;
  onStop?: () => void;
}

/** The coach: what it says, the question it asks, the one primary button, and free help. Never red. */
export function CoachPanel({ state, engine, next, onNext, onStop }: Props) {
  const { phase } = state;
  const stopHere = () => {
    engine.stop();
    onStop?.();
  };
  const suggestStop = state.stopSuggested && phase !== "done";
  useFocusOnAppear(state.nudgeOffer, "[data-coach-nudge] button");
  useFocusOnAppear(state.skipTourAsk, "[data-coach-skip-tour] [data-coach-primary]");
  useFocusOnAppear(suggestStop, "[data-coach-stop-suggestion] button");
  return (
    <aside data-coach-panel aria-label="Coach" className="relative z-50 flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm md:col-start-2 md:row-start-1">
      {/* Everything the coach says or asks lives in one polite live region, so a screen reader hears it. */}
      <div aria-live="polite" data-coach-live className="space-y-2">
        {state.ghost && <p data-coach-narration>{state.ghost.narration}</p>}
        {state.doneLine && phase === "scene" && (
          <p data-coach-done className="text-sm text-muted-foreground">
            {state.doneLine}
          </p>
        )}
        {state.announce && (
          <span data-coach-announce className="sr-only">
            {state.announce}
          </span>
        )}
        {phase !== "done" && phase !== "quick-offer" && (
          <p data-coach-say>
            {state.yourTurn && <strong>Your turn. </strong>}
            {state.say}
            {state.stranded && <strong> Select {state.strandedButton} to try the steps again.</strong>}
          </p>
        )}
        {state.reply && phase === "scene" && (
          <div data-coach-reply className="rounded-md bg-secondary p-2 text-secondary-foreground">
            <p className="text-sm font-semibold">Let's watch</p>
            <p>{state.reply}</p>
          </div>
        )}
        {state.hint && (
          <p data-coach-hint className="rounded-md border p-2">
            <span className="font-medium">Hint {state.hint.rung} of 3. </span>
            {state.hint.text}
          </p>
        )}

        {suggestStop && (
          <div data-coach-stop-suggestion className="space-y-2 rounded-md border p-2">
            <p>You have been at this for 12 minutes. A good place to stop is after this goal.</p>
            <Button variant="outline" size="sm" onClick={() => engine.dismissStopSuggestion()}>
              Okay
            </Button>
          </div>
        )}

        {state.skipTourAsk && (
          <div data-coach-question data-coach-skip-tour className="space-y-2 rounded-md border p-2">
            <p className="font-medium">Skip the tour?</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => engine.answerSkipTour(true)}>
                Skip the tour
              </Button>
              <Button variant="outline" size="sm" data-coach-primary onClick={() => engine.answerSkipTour(false)}>
                Keep going
              </Button>
            </div>
          </div>
        )}

        {phase === "quick-offer" && (
          <div data-coach-question className="space-y-2">
            <p className="font-medium">Quick version?</p>
            <p>You have done the last lessons smoothly, so we can skip the optional parts.</p>
            <div className="flex gap-2">
              <Button data-coach-primary onClick={() => engine.chooseQuick(true)}>
                Quick version
              </Button>
              <Button variant="outline" onClick={() => engine.chooseQuick(false)}>
                Full version
              </Button>
            </div>
          </div>
        )}

        {state.nudgeOffer && (
          <div data-coach-nudge className="space-y-2 rounded-md border p-2">
            <p className="font-medium">Want a nudge?</p>
            <div className="flex flex-wrap gap-2">
              {state.canHint && (
                <Button size="sm" onClick={() => engine.nudge()}>
                  Nudge
                </Button>
              )}
              {state.canShowMe && (
                <Button size="sm" variant="outline" onClick={() => engine.showMe()}>
                  Show me
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => engine.imFine()}>
                I'm fine
              </Button>
            </div>
          </div>
        )}
      </div>

      {phase === "scene" && state.missed && (
        <div data-coach-missed role="status" className="space-y-2 rounded-md border-2 border-foreground p-3">
          <p>{state.missed}</p>
          <Button size="sm" data-coach-primary onClick={() => {
              engine.tryAgain();
              findCoachTarget(coachId.button("step"))?.focus();
            }}>
            Try again
          </Button>
        </div>
      )}

      {phase === "scene" && <AskUi state={state} engine={engine} />}

      {phase === "scene" && state.waiting === "continue" && (
        <Button data-coach-primary className="self-start" onClick={() => engine.continue()}>
          Continue
        </Button>
      )}

      {phase === "ghost" && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => engine.cancelGhost()}>
          Skip the demo
        </Button>
      )}

      {phase === "scene" && (state.canHint || state.canShowMe || state.canSkip) && (
        <div data-coach-help role="group" aria-label="Help, free and never counted against you" className="flex flex-wrap gap-2 border-t pt-3">
          {state.canHint && (
            <Button variant="outline" size="sm" onClick={single(() => engine.hint())}>
              Hint
            </Button>
          )}
          {state.canShowMe && (
            <Button variant="outline" size="sm" onClick={single(() => engine.showMe())}>
              Show me
            </Button>
          )}
          {state.canSkip && (
            <Button variant="outline" size="sm" onClick={single(() => engine.skip())}>
              Skip
            </Button>
          )}
        </div>
      )}

      {phase === "done" && state.end && !state.stopped && (
        <section data-coach-end aria-labelledby="coach-now-you-can" className="space-y-3">
          <h2 id="coach-now-you-can" className="text-lg font-semibold">
            Now you can
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {state.end.nowYouCan.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p data-coach-made>
            You made: {state.end.made.join(", ")}. {state.end.values.join(", ")}.
          </p>
          {state.stopSuggested && <p>You have been at this a while, so this is a good place to stop.</p>}
          <div className="flex flex-wrap gap-2">
            {next && (
              <Button data-coach-primary variant={state.stopSuggested ? "outline" : "default"} onClick={() => onNext?.(next.id)}>
                Next lesson, about {next.minutes} min
              </Button>
            )}
            <Button data-coach-primary={!next || undefined} variant={state.stopSuggested || !next ? "default" : "outline"} onClick={stopHere}>
              Stop here
            </Button>
          </div>
        </section>
      )}
      {state.stopped && <p data-coach-stopped>Stopped here. Your progress is saved, and the next lesson will be waiting.</p>}
    </aside>
  );
}
