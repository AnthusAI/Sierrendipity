import { assemble } from "@sierrendipity/explorer";
import { useState, type ReactNode } from "react";
import { HeartbeatView, MachineView, PixelDisplay, PointerWalk, TimelineControls, useMachineTimeline } from "@/diagrams";

export const title = "Diagrams";

// Lesson 5: put 5, put 7, add them. The trailing end marker is added (and hidden) by the hook.
const ADD = assemble("addi a0, zero, 5\naddi a1, zero, 7\nadd a2, a0, a1").words;
// Paint pixel 0 with colour 3.
const PIXEL = assemble("addi t0, zero, 3\nsb t0, 1024(zero)").words;

function Demo({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={name} className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">{name}</h3>
      {children}
    </div>
  );
}

interface DemoProps {
  reducedMotion?: boolean;
}

function Clerk({ name, boxes, pointer, reducedMotion }: DemoProps & { name: string; boxes: string[]; pointer?: boolean }) {
  const tl = useMachineTimeline(ADD, { hideEnd: true, boxes, pointer, reducedMotion });
  return (
    <Demo name={name}>
      <MachineView timeline={tl} />
      <TimelineControls timeline={tl} />
    </Demo>
  );
}

function Heartbeat({ reducedMotion }: DemoProps) {
  const tl = useMachineTimeline(ADD, { hideEnd: true, boxes: ["a0", "a1", "a2"], pointer: true, reducedMotion });
  return (
    <Demo name="Heartbeat">
      <HeartbeatView timeline={tl} />
      <TimelineControls timeline={tl} />
    </Demo>
  );
}

function Walk({ reducedMotion }: DemoProps) {
  const tl = useMachineTimeline(ADD, { hideEnd: true, pointer: true, reducedMotion });
  return (
    <Demo name="Pointer walk">
      <PointerWalk timeline={tl} />
      <TimelineControls timeline={tl} />
    </Demo>
  );
}

function Pixels({ reducedMotion }: DemoProps) {
  const tl = useMachineTimeline(PIXEL, { hideEnd: true, boxes: ["t0"], reducedMotion });
  return (
    <Demo name="Pixel display">
      <PixelDisplay timeline={tl} />
      <TimelineControls timeline={tl} />
    </Demo>
  );
}

export default function DiagramsSection() {
  const [reduced, setReduced] = useState(false);
  const reducedMotion = reduced ? true : undefined;
  return (
    <div className="space-y-6">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={reduced} onChange={(event) => setReduced(event.target.checked)} className="size-4 accent-primary" />
        Reduce motion (lab only; the app follows the system setting)
      </label>
      <Clerk name="Clerk and boxes" boxes={["a0", "a1", "a2"]} reducedMotion={reducedMotion} />
      <Clerk name="Clerk with one box" boxes={["a0"]} reducedMotion={reducedMotion} />
      <Clerk name="Clerk with pointing hand" boxes={["a0", "a1", "a2"]} pointer reducedMotion={reducedMotion} />
      <Heartbeat reducedMotion={reducedMotion} />
      <Walk reducedMotion={reducedMotion} />
      <Pixels reducedMotion={reducedMotion} />
    </div>
  );
}
