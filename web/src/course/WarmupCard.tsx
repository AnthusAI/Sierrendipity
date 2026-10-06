import { describe } from "@sierrendipity/explorer";
import type { PickedWarmup } from "@sierrendipity/lesson-core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Result = { correct: boolean } | null;

/**
 * One predict-the-result question at the start of a session. A miss is shown kindly with the cards in plain
 * English; skipping is free. `onAnswer` records the answer; `onDone` closes the card (answered or skipped).
 */
export function WarmupCard({ picked, onAnswer, onDone }: { picked: PickedWarmup; onAnswer: (correct: boolean) => void; onDone: () => void }) {
  const { warmup } = picked;
  const [answer, setAnswer] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const check = (event: FormEvent) => {
    event.preventDefault();
    const text = answer.trim();
    const value = text === "" ? NaN : Number(text);
    if (!Number.isFinite(value)) {
      setProblem("Type a number to check.");
      return;
    }
    setProblem(null);
    const correct = value === warmup.expected;
    setResult({ correct });
    onAnswer(correct);
  };

  const cards = warmup.program.words.map((word) => describe(word).text);
  return (
    <section aria-label="Warm-up" data-layout-item="warm-up" className="grid gap-3 rounded-xl border bg-card p-5 text-card-foreground">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Warm-up: guess first</h2>
      <p className="text-base font-medium">{warmup.question}</p>
      {result === null ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={check} noValidate>
          <label className="sr-only" htmlFor="warmup-answer">
            Your answer
          </label>
          <Input id="warmup-answer" ref={input} className="h-10 w-32 text-base" inputMode="numeric" autoComplete="off" value={answer} aria-invalid={problem !== null} onChange={(e) => setAnswer(e.target.value)} />
          <Button type="submit" className="h-10 px-4">
            Check
          </Button>
          <Button type="button" variant="outline" className="h-10 px-4" onClick={onDone}>
            Skip
          </Button>
          {problem && (
            <p role="status" className="w-full text-sm text-muted-foreground">
              {problem}
            </p>
          )}
        </form>
      ) : (
        <div className="grid gap-2" role="status">
          {result.correct ? (
            <p>Yes, {warmup.expected}. That idea is getting stronger.</p>
          ) : (
            <>
              <p>Let&apos;s see why.</p>
              <p>
                Box {warmup.target} holds {warmup.expected}. The cards say:
              </p>
              <ol className="list-decimal pl-6 text-sm">
                {cards.map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ol>
            </>
          )}
          <div>
            <Button className="h-9 px-4" variant={result.correct ? "default" : "outline"} onClick={onDone}>
              {result.correct ? "Done" : "Got it"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
