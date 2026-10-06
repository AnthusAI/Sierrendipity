import { CardList } from "./CardList";
import { TEST_CLOCK, type MachineTimeline } from "./useMachineTimeline";

/** D6, the program counter walk: the arrow slides along the card list, with byte addresses (0, 4, 8 ...) beside the cards. */
export function PointerWalk({ timeline: tl }: { timeline: MachineTimeline }) {
  return (
    <div data-diagram-surface data-animation-t={TEST_CLOCK ? tl.t : undefined} className="rounded-lg border bg-card p-4 text-card-foreground">
      <CardList timeline={tl} addresses hand />
      <p className="mt-3 text-sm">
        The arrow points at address <span className="font-mono font-medium tabular-nums">{tl.snapshot.pc}</span>
        {tl.hideEnd && tl.isAtEnd ? ", the end of the list." : "."}
      </p>
    </div>
  );
}
