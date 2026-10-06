import { OctagonX } from "lucide-react";
import { stopNotice } from "./narrate";
import type { MachineTimeline } from "./useMachineTimeline";

/** A visible note when the machine stopped on a fault or was cut off at the step limit. Nothing otherwise. */
export function Notice({ timeline }: { timeline: MachineTimeline }) {
  const text = stopNotice(timeline);
  if (!text) return null;
  return (
    <p data-notice className="flex items-start gap-2 rounded-md border border-danger-fg bg-danger-bg px-3 py-2 text-sm font-medium text-danger-fg">
      <OctagonX aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
