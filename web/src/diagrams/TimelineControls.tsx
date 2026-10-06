import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Notice } from "./Notice";
import { SPEEDS, type MachineTimeline, type Speed } from "./useMachineTimeline";

const speedLabel = (speed: Speed) => (speed === "instant" ? "Instant" : `${speed}x`);
// aria-disabled (not disabled) keeps the button focusable, so keyboard focus is not lost when Step reaches the end.
const dim = "aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

/**
 * Back, Step, Play/Pause, scrubber, speed and Reset for a machine timeline, plus a note when the machine
 * stopped on a fault. All native or shadcn controls, so keyboard and screen readers just work.
 */
export function TimelineControls({ timeline: tl, className }: { timeline: MachineTimeline; className?: string }) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <div role="group" aria-label="Playback controls" className="flex flex-wrap items-center gap-2">
        <Button variant="outline" className={dim} aria-disabled={tl.position === 0} onClick={tl.stepBackward}>
          <ChevronLeft aria-hidden /> Back
        </Button>
        <Button className={dim} aria-disabled={tl.isAtEnd} onClick={tl.stepForward}>
          Step <ChevronRight aria-hidden />
        </Button>
        {tl.playing ? (
          <Button variant="secondary" onClick={tl.pause}>
            <Pause aria-hidden /> Pause
          </Button>
        ) : (
          <Button variant="secondary" className={dim} aria-disabled={tl.length === 0} onClick={tl.play}>
            <Play aria-hidden /> Play
          </Button>
        )}
        <input
          type="range"
          aria-label="Position"
          aria-valuetext={`Step ${tl.position} of ${tl.length}`}
          min={0}
          max={tl.length}
          step={1}
          value={tl.position}
          onChange={(event) => tl.seek(Number(event.target.value))}
          className="h-8 min-w-24 flex-1 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <span data-readout className="min-w-20 text-sm tabular-nums text-foreground">
          Step {tl.position} of {tl.length}
        </span>
        <NativeSelect aria-label="Speed" value={String(tl.speed)} onChange={(event) => tl.setSpeed(SPEEDS.find((s) => String(s) === event.target.value) ?? 1)}>
          {SPEEDS.map((speed) => (
            <option key={speed} value={String(speed)}>
              {speedLabel(speed)}
            </option>
          ))}
        </NativeSelect>
        <Button variant="ghost" onClick={tl.reset}>
          <RotateCcw aria-hidden /> Reset
        </Button>
      </div>
      <Notice timeline={tl} />
    </div>
  );
}
