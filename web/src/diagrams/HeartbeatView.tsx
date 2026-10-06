import { ArrowRight } from "lucide-react";
import { Fragment } from "react";
import { cardText } from "./narrate";
import { Notice } from "./Notice";
import { TEST_CLOCK, type MachineTimeline } from "./useMachineTimeline";

const STATIONS = [
  { name: "Fetch", caption: "Read the card the arrow points at." },
  { name: "Do", caption: "Do what the card says." },
  { name: "Move on", caption: "Move the arrow to the next card." },
] as const;

type StationState = "waiting" | "lit" | "done";

/** Which station is lit at clock time `t` of a step; every station is done once the beat has finished. */
function stationStates(tl: MachineTimeline): StationState[] {
  if (tl.position === 0) return ["waiting", "waiting", "waiting"];
  const beating = tl.from !== null && tl.from === tl.position - 1 && !tl.reducedMotion && tl.t < 1;
  if (!beating) return ["done", "done", "done"];
  const lit = Math.min(2, Math.floor(tl.t * 3));
  return STATIONS.map((_, i) => (i < lit ? "done" : i === lit ? "lit" : "waiting"));
}

const cue: Record<StationState, string> = { waiting: "waiting", lit: "now", done: "done" };

/** D3, the heartbeat: Fetch, Do and Move on light in turn within every step. */
export function HeartbeatView({ timeline: tl, pointer = tl.pointer }: { timeline: MachineTimeline; pointer?: boolean }) {
  const states = stationStates(tl);
  const stepped = tl.position > 0;
  // The card of this beat: the one that just ran, or the first one to run before any step.
  const index = stepped && tl.lastStep ? tl.lastStep.pc / 4 : tl.snapshot.pc / 4;
  const word = tl.words[index];
  // The arrow moves in the last station, so before that it still points at the card that ran.
  const moved = !stepped || states[2] !== "waiting";
  const arrow = moved ? tl.snapshot.pc : index * 4;
  return (
    <div data-diagram-surface data-animation-t={TEST_CLOCK ? tl.t : undefined} className="space-y-4 rounded-lg border bg-card p-4 text-card-foreground">
      <ol aria-label="The heartbeat" className="flex flex-wrap items-stretch gap-2">
        {STATIONS.map((station, i) => (
          <Fragment key={station.name}>
            <li
              data-station={station.name}
              data-state={states[i]}
              className={`w-44 rounded-md border-2 p-3 ${
                states[i] === "lit" ? "border-foreground bg-changed text-changed-foreground" : "border-border bg-background text-foreground"
              }`}
            >
              <p className="font-semibold">{station.name}</p>
              <p className="text-sm">{station.caption}</p>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide">{cue[states[i]]}</p>
            </li>
            {i < STATIONS.length - 1 && <ArrowRight aria-hidden className="size-4 self-center text-foreground" />}
          </Fragment>
        ))}
      </ol>
      <div className="space-y-1 text-sm">
        <p>
          <span className="text-muted-foreground">{stepped ? "This beat's card: " : "Next card: "}</span>
          <span data-heartbeat-card className="font-medium">
            {word !== undefined ? cardText(word) : tl.hideEnd && !tl.lastStep?.fault ? "the end of the list" : "no card at this address"}
          </span>
        </p>
        {pointer && (
          <p data-arrow>
            The arrow points at address <span className="font-mono font-medium tabular-nums">{arrow}</span>.
          </p>
        )}
      </div>
      <Notice timeline={tl} />
    </div>
  );
}
