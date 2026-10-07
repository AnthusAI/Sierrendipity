import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { coachId } from "./ids";
import type { LiveView, StageControl, StageControls } from "./types";
import type { LessonUi } from "@sierrendipity/lesson-core";

/** How long Run waits between cards, the same beat as one animated Step. */
export const RUN_BEAT_MS = 900;

function Tip({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="tooltip" className="pointer-events-none absolute -top-7 left-0 z-10 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs text-background opacity-0 transition-opacity peer-hover:opacity-100 peer-focus-visible:opacity-100">
      {children}
    </span>
  );
}

interface ActionProps {
  control: "step" | "back" | "reset" | "run" | "pause";
  label: string;
  /** Why the button does nothing right now (the machine is at an end), when it does not. */
  idleWhy?: string;
  /** The button can act (when false it is idle, and explains why). */
  can: boolean;
  locked: boolean;
  primary?: boolean;
  icon?: "left" | "right" | "reset" | "play" | "pause";
  run: () => void;
}

/**
 * A control wired to the player: aria-disabled (so focus is never lost), "Not yet" when the scene locks it, and
 * a note when it has nothing to do. The scene decides; the stage never has a second opinion.
 */
function Action({ control, label, idleWhy, can, locked, primary = false, icon, run }: ActionProps) {
  const uid = useId();
  const idle = !locked && !can;
  const tip = `${uid}-${control}`;
  const Icon = icon === "left" ? ChevronLeft : icon === "right" ? ChevronRight : icon === "reset" ? RotateCcw : icon === "play" ? Play : icon === "pause" ? Pause : null;
  return (
    <div className="relative flex flex-col items-start gap-1">
      <Button
        data-coach-id={coachId.button(control)}
        variant={primary && !idle && !locked ? "default" : "outline"}
        aria-disabled={locked || idle || undefined}
        aria-describedby={locked ? tip : idle && idleWhy ? `${tip}-why` : undefined}
        className={cn("peer", (locked || idle) && "cursor-not-allowed border-dashed text-muted-foreground")}
        onClick={() => !locked && !idle && run()}
      >
        {icon === "right" ? label : null}
        {Icon && <Icon aria-hidden />}
        {icon === "right" ? null : label}
      </Button>
      {locked && <Tip id={tip}>Not yet</Tip>}
      {idle && idleWhy && (
        <span id={`${tip}-why`} data-idle-note className="text-xs text-muted-foreground">
          {idleWhy}
        </span>
      )}
    </div>
  );
}

interface Props {
  live: LiveView;
  controls: StageControls;
  /** Add Run, Pause and the scrubber (`show: [timeline]`). */
  timeline?: boolean;
  /** How many steps the scrubber spans (the length of the recorded run). */
  length: number;
  /** Which buttons the lesson shows, and what it calls Step (a lesson's `ui` block). */
  ui?: LessonUi;
}

/**
 * Step, Back and Reset for the player's one live machine, and with `timeline` also Run, Pause and a scrubber.
 * They all call the player (`controls.step/back/reset`); the diagram follows the player, never the other way.
 */
export function PlayerControls({ live, controls, timeline = false, length, ui }: Props) {
  const locked = (c: StageControl) => controls.isLocked(c);
  const [running, setRunning] = useState(false);
  const latest = useRef({ live, controls });
  latest.current = { live, controls };

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const { live: now, controls: c } = latest.current;
      if (!now.canStep || c.isLocked("step") || c.isLocked("run")) setRunning(false);
      else c.step();
    }, RUN_BEAT_MS);
    return () => clearInterval(id);
  }, [running]);
  // The ghost took over, or the scene locked Run: stop quietly.
  useEffect(() => {
    if (running && (live.demo || locked("run"))) setRunning(false);
  });

  /** Move the player to `to` steps by pressing its own Step or Back, so the scrubber is never a second machine. */
  const scrubTo = (to: number) => {
    const { live: now, controls: c } = latest.current;
    for (let i = now.steps; i < to; i++) c.step();
    for (let i = now.steps; i > to; i--) c.back();
  };
  const scrubLocked = locked("step") || locked("back");
  const shown = (control: "back" | "reset") => !ui?.controls || ui.controls.includes(control);

  return (
    <div role="group" aria-label="Machine controls" className="flex flex-wrap items-start gap-2">
      <Action control="step" label={ui?.stepLabel ?? "Step"} icon="right" primary can={live.canStep} locked={locked("step")} idleWhy={ui?.controls && !ui.controls.includes("back") ? "All done" : "Select Back first"} run={controls.step} />
      {shown("back") && <Action control="back" label="Back" icon="left" can={live.canBack} locked={locked("back")} idleWhy="Nothing to undo yet" run={controls.back} />}
      {timeline &&
        (running ? (
          <Action control="pause" label="Pause" icon="pause" can locked={false} run={() => setRunning(false)} />
        ) : (
          <Action control="run" label="Run" icon="play" can={live.canStep} locked={locked("run")} idleWhy="Select Reset first" run={() => setRunning(true)} />
        ))}
      {shown("reset") && <Action control="reset" label={ui?.resetLabel ?? "Reset"} icon="reset" can={live.steps > 0} idleWhy="Nothing to start again yet" locked={locked("reset")} run={controls.reset} />}
      {timeline && (
        <div className="flex min-w-48 flex-1 items-center gap-2">
          <input
            type="range"
            aria-label="Position"
            aria-valuetext={`Step ${live.steps} of ${length}`}
            aria-disabled={scrubLocked || undefined}
            data-coach-scrubber
            min={0}
            max={length}
            step={1}
            value={Math.min(live.steps, length)}
            onChange={(event) => !scrubLocked && scrubTo(Number(event.currentTarget.value))}
            className="h-8 min-w-24 flex-1 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <span data-readout className="min-w-20 text-sm tabular-nums">
            Step {live.steps} of {length}
          </span>
        </div>
      )}
    </div>
  );
}
