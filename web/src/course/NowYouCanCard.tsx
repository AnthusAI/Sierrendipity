import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { about, StarChips } from "./parts";

export interface NowYouCanCardProps {
  /** The lesson just passed: its title and what it taught (the card says the first sentence). */
  lesson: { title: string; nowYouCan: string[] };
  /** The stars earned this time ("pass" and bonus ids) and the next lesson's length (null: no next lesson). */
  stats: { stars: string[]; nextMinutes: number | null };
  onNext: () => void;
  onStop: () => void;
  /** The thing the student made (a picture, a program): shown in the middle of the card. */
  children?: ReactNode;
}

/** The card that ends every lesson on a win: one sentence, what the student made, stars, and two ways on. */
export function NowYouCanCard({ lesson, stats, onNext, onStop, children }: NowYouCanCardProps) {
  const sentence = lesson.nowYouCan[0];
  return (
    <section aria-label="Now you can" className="grid gap-3 rounded-xl border bg-card p-5 text-card-foreground">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Now you can</h2>
      {sentence && <p className="text-lg font-medium">{sentence}</p>}
      {children && (
        <div data-made className="rounded-lg border bg-background p-3">
          {children}
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-label={`Stars for ${lesson.title}`} role="group">
        <StarChips stars={stats.stars} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {stats.nextMinutes !== null && (
          <Button size="default" className="h-10 px-4" onClick={onNext}>
            Next lesson, {about(stats.nextMinutes)}
          </Button>
        )}
        <Button variant="outline" className="h-10 px-4" onClick={onStop}>
          Stop here
        </Button>
      </div>
    </section>
  );
}
