import { RotateCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useCourse } from "./CourseProvider";
import { deckKinds, type DeckKind } from "./model";

/** 32 read-only lamps, most significant bit first, in groups of four. */
export function LampStrip({ bits }: { bits: string }) {
  return (
    <div data-bits={bits} role="img" aria-label={`32 bits: ${bits.replace(/(.{4})(?=.)/g, "$1 ")}`} className="grid grid-cols-[repeat(16,minmax(0,1fr))] gap-1">
      {[...bits].map((bit, i) => (
        <span key={i} data-lamp data-lit={bit === "1"} className={cn("aspect-square rounded-full border", bit === "1" ? "border-primary bg-primary" : "border-input bg-background")} />
      ))}
    </div>
  );
}

function DeckCard({ card, met }: { card: DeckKind; met: boolean }) {
  const [flipped, setFlipped] = useState(false);
  if (!met) {
    return (
      <li data-deck-card={card.title} data-state="face-down" data-layout-item={card.title} className="rounded-xl border border-dashed bg-muted p-4 text-muted-foreground">
        <button type="button" disabled aria-label="A card you have not met yet" className="grid w-full gap-1 text-left">
          <span aria-hidden className="text-2xl font-semibold">?</span>
          <span className="text-sm">Not met yet</span>
        </button>
      </li>
    );
  }
  return (
    <li data-deck-card={card.title} data-state="face-up" data-flipped={flipped} data-layout-item={card.title} className="grid content-start gap-2 rounded-xl border bg-card p-4 text-card-foreground">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold">{card.title}</h2>
        <button
          type="button"
          aria-label={`Flip ${card.title}`}
          aria-pressed={flipped}
          onClick={() => setFlipped(!flipped)}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <RotateCw aria-hidden className="size-4" />
        </button>
      </div>
      {flipped ? (
        <div data-face="back" className="grid gap-2">
          <p className="text-sm text-muted-foreground">In assembly it is called</p>
          <p className="font-mono text-lg font-semibold">{card.name}</p>
          <LampStrip bits={card.bits} />
        </div>
      ) : (
        <p data-face="front" className="text-sm">
          {card.front}
        </p>
      )}
    </li>
  );
}

/** One card per kind; face down until the student has used that kind in a passing program. */
export function DeckView({ cardsUsed }: { cardsUsed: string[] }) {
  const cards = deckKinds();
  const used = new Set(cardsUsed);
  const met = cards.filter((c) => used.has(c.kind)).length;
  return (
    <section aria-label="Instruction Deck" className="grid gap-4">
      <p className="text-muted-foreground">{`${met} of ${cards.length} met`}</p>
      <ul className="grid grid-cols-3 gap-4">
        {cards.map((card) => (
          <DeckCard key={card.kind} card={card} met={used.has(card.kind)} />
        ))}
      </ul>
    </section>
  );
}

export function DeckPage() {
  const { data } = useCourse();
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Instruction Deck</h1>
      <DeckView cardsUsed={data.cardsUsed} />
    </div>
  );
}
