import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { LessonEngine, PlayerState } from "./engine";
import type { LessonInfo } from "../lessons";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

function NumberAsk({ state, engine }: { state: PlayerState; engine: LessonEngine }) {
  const [text, setText] = useState("");
  const ask = state.ask!;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (/^\d+$/.test(text)) {
      engine.answer(Number(text));
      setText("");
    }
  };
  return (
    <form data-coach-ask onSubmit={submit} className="space-y-2" aria-label="Your prediction">
      <p id="coach-question" className="font-medium">
        {ask.question}
      </p>
      <input
        data-coach-primary
        aria-label="Your answer"
        aria-describedby="coach-question"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-lg tabular-nums text-foreground"
      />
      <div role="group" aria-label="Number pad" className="grid grid-cols-5 gap-1">
        {PAD.map((d) => (
          <Button key={d} variant="outline" size="sm" aria-label={d} onClick={() => setText((t) => (t + d).slice(0, 6))}>
            {d}
          </Button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit">Answer</Button>
        <Button variant="outline" aria-label="Delete the last digit" onClick={() => setText((t) => t.slice(0, -1))}>
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
      <p className="text-muted-foreground">Click the part you mean.</p>
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
  return (
    <aside data-coach-panel aria-label="Coach" className="relative z-50 flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
      <div aria-live="polite" data-coach-live className="space-y-2">
        {state.ghost && <p data-coach-narration>{state.ghost.narration}</p>}
        {state.doneLine && phase === "scene" && (
          <p data-coach-done className="text-sm text-muted-foreground">
            {state.doneLine}
          </p>
        )}
        {phase !== "done" && phase !== "quick-offer" && (
          <p data-coach-say>
            {state.yourTurn && <strong>Your turn. </strong>}
            {state.say}
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
      </div>

      {state.stopSuggested && phase !== "done" && (
        <div data-coach-stop-suggestion className="space-y-2 rounded-md border p-2">
          <p>You have been at this for 12 minutes. A good place to stop is after this goal.</p>
          <Button variant="outline" size="sm" onClick={() => engine.dismissStopSuggestion()}>
            Okay
          </Button>
        </div>
      )}

      {state.skipTourAsk && (
        <div data-coach-question className="space-y-2 rounded-md border p-2">
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
            <Button variant="outline" size="sm" onClick={() => engine.hint()}>
              Hint
            </Button>
          )}
          {state.canShowMe && (
            <Button variant="outline" size="sm" onClick={() => engine.showMe()}>
              Show me
            </Button>
          )}
          {state.canSkip && (
            <Button variant="outline" size="sm" onClick={() => engine.skip()}>
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
      {state.stopped && (
        <p data-coach-stopped>Stopped here. Your progress is saved, and the next lesson will be waiting.</p>
      )}
    </aside>
  );
}
