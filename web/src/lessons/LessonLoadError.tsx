import { Button } from "@/components/ui/button";

/** What a student sees when a lesson cannot be loaded: kind words and a way out, never developer text. */
export function LessonLoadError({ onRetry, onBack }: { onRetry: () => void; onBack: () => void }) {
  return (
    <div role="alert" data-lesson-load-error className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
      <p className="font-medium">This lesson couldn't load. Try again, or pick another lesson.</p>
      <div className="flex gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="outline" onClick={onBack}>
          Back to the path
        </Button>
      </div>
    </div>
  );
}
