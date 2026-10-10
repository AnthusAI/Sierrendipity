import { CardList } from "./CardList";
import { Notice } from "./Notice";
import { TEST_CLOCK, type MachineTimeline } from "./useMachineTimeline";

/** D6, the program counter walk: the arrow slides along the card list, with byte addresses (0, 4, 8 ...) beside the cards. */
export function PointerWalk({ timeline: tl, coachIds = false }: { timeline: MachineTimeline; coachIds?: boolean }) {
  return (
    <div data-diagram-surface data-animation-t={TEST_CLOCK ? tl.t : undefined} className="rounded-lg border bg-card p-4 text-card-foreground">
      <CardList timeline={tl} addresses hand coachIds={coachIds} />
      <p className="my-3 text-sm">
        The arrow points at address <span className="font-mono font-medium tabular-nums">{tl.snapshot.pc}</span>
        {tl.endHidden && tl.isAtEnd ? ", the end of the list." : "."}
      </p>
      <Notice timeline={tl} />
    </div>
  );
}
