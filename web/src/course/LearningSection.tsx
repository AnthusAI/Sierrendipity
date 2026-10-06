import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "../dialogs";
import { useCourse } from "./CourseProvider";

/** The Learning part of the Settings dialog: the tutor override and a reset of this student's progress. */
export function LearningSection() {
  const { unlockAll, setUnlockAll, resetProgress } = useCourse();
  const [asking, setAsking] = useState(false);
  const id = useId();
  return (
    <>
      <h2 className="-mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Learning</h2>
      <section className="grid gap-3">
        <div className="flex items-start gap-3">
          <Checkbox id={id} checked={unlockAll} onCheckedChange={(value) => setUnlockAll(value === true)} className="mt-0.5" />
          <div className="grid gap-0.5">
            <Label htmlFor={id} className="text-sm font-semibold">
              Unlock all lessons
            </Label>
            <p className="text-sm text-muted-foreground">For a tutor: every lesson opens, in any order. Off by default.</p>
          </div>
        </div>
        <div className="grid justify-items-start gap-1">
          <Button variant="outline" size="sm" onClick={() => setAsking(true)}>
            Reset my progress
          </Button>
          <p className="text-sm text-muted-foreground">Starts the course over on this browser. Your Gallery stays.</p>
        </div>
      </section>
      {asking && (
        <ConfirmDialog
          title="Reset your progress?"
          description="This clears your lessons, stars and Instruction Deck for your account in this browser. It cannot be undone."
          confirm="Reset"
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            resetProgress();
            setAsking(false);
          }}
        />
      )}
    </>
  );
}
