import { describe } from "@sierrendipity/explorer";
import type { FlipSpec, LampSpec } from "@sierrendipity/lesson-core";
import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { cardToWord, wordToCard, type Card } from "../cards/model";
import type { TrayItem } from "../cards/ProgramBuilder";
import { ALL_LENSES, BitLamps, CardFlip, CarryRipple, FieldBands, type Lens } from "../lamps";
import type { EditVia } from "./types";

// The builder (drag and drop) is the heaviest part of the stage: load it only for a scene that shows it.
const ProgramBuilder = lazy(() => import("../cards/ProgramBuilder").then((m) => ({ default: m.ProgramBuilder })));

/** `addi`: a put or add-a-number card, whose number sits in bits 20 to 31 as place values 1, 2, 4. */
const isNumberCard = (word: number) => (word & 0x7f) === 0x13;
const NUMBER_SHIFT = 20;

interface LampView {
  value: number;
  width: number;
  /** The new word for a new lamp value. */
  toWord: (value: number) => number;
  number: boolean;
}

/** What the lamps of a card show: the whole 32-bit word, or just the number of a put card. */
export function lampView(spec: LampSpec, word: number): LampView {
  if (spec.of === "number" && isNumberCard(word)) {
    const width = spec.width ?? 8;
    const mask = 2 ** width - 1;
    const imm = word >>> NUMBER_SHIFT;
    return {
      value: imm & mask,
      width,
      number: true,
      // Only the lamps shown change; the bits above them (the sign) and the rest of the card stay as they are.
      toWord: (value) => (((word & 0xfffff) | ((((imm & ~mask) | value) & 0xfff) << NUMBER_SHIFT)) >>> 0),
    };
  }
  return { value: word >>> 0, width: 32, number: false, toWord: (value) => value >>> 0 };
}

interface WidgetProps {
  cards: number[];
  /** True when the scene has locked toggling (the lamps then only show). */
  readOnly: boolean;
  onEdit: (card: number, word: number, via: EditVia) => void;
}

/** D4: bit lamps on one card. A lamp toggle replaces the whole word of the card. */
export function LampsPanel({ spec, cards, readOnly, onEdit }: WidgetProps & { spec: LampSpec }) {
  const word = cards[spec.card] ?? 0;
  const view = lampView(spec, word);
  return (
    <div data-coach-id="diagram:D4" className="space-y-3 rounded-lg border bg-card p-4 text-card-foreground">
      <div data-coach-id="tab:lamps" className="space-y-3">
        {spec.target !== undefined && (
          <p data-lamps-target className="text-sm font-medium">
            Make the lamps add up to <span className="tabular-nums">{spec.target}</span>
          </p>
        )}
        {!readOnly && (
          <p data-lamps-card className="text-sm text-muted-foreground">
            Card {spec.card + 1}: {describe(word).text}
          </p>
        )}
        <BitLamps
          label={`Lamps of card ${spec.card + 1}`}
          value={view.value}
          width={view.width}
          labels={view.number && !spec.hide?.includes("worth")}
          showTotal={view.number && !spec.hide?.includes("total")}
          coachIds
          readOnly={readOnly}
          {...(spec.lockedBits ? { lockedBits: spec.lockedBits } : {})}
          {...(spec.allowedBits ? { allowedBits: spec.allowedBits } : {})}
          onChange={(value) => onEdit(spec.card, view.toWord(value), "toggle")}
        />
      </div>
    </div>
  );
}

/** D8: field bands on one card; each band is a button with a coach id, so a lesson can ask "which band says...". */
export function BandsPanel({ spec, cards, readOnly, onEdit }: WidgetProps & { spec: LampSpec }) {
  const word = cards[spec.card] ?? 0;
  return (
    <div data-coach-id="diagram:D8" className="rounded-lg border bg-card p-4 text-card-foreground">
      <FieldBands
        word={word}
        label={`Bands of card ${spec.card + 1}`}
        coachIds
        readOnly={readOnly}
        onHoverField={() => {}}
        onChange={(value) => onEdit(spec.card, value >>> 0, "toggle")}
        {...(spec.lockedBits ? { lockedBits: spec.lockedBits } : {})}
        {...(spec.allowedBits ? { allowedBits: spec.allowedBits } : {})}
      />
    </div>
  );
}

/** D5: one card that flips through its views. */
export function FlipPanel({ spec, cards }: { spec: FlipSpec; cards: number[] }) {
  const lenses = (spec.lenses ?? ALL_LENSES) as readonly Lens[];
  return (
    <div data-coach-id="diagram:D5" className="rounded-lg border bg-card p-4 text-card-foreground">
      <div data-coach-id="flip">
        <CardFlip word={cards[spec.card] ?? 0} lenses={lenses} label={`Card ${spec.card + 1}, flipped`} />
      </div>
    </div>
  );
}

/** D7: adding two numbers in lamps, with the carry. */
export function CarryPanel({ a, b }: { a: number; b: number }) {
  return (
    <div data-coach-id="diagram:D7" className="rounded-lg border bg-card p-4 text-card-foreground">
      <CarryRipple a={a} b={b} label={`${a} plus ${b} with the carry`} />
    </div>
  );
}

/**
 * The cards the builder works on, kept as the same array until the player's cards really change, so the builder's
 * undo history survives the round trip through the player.
 */
function useBuilderCards(words: number[]): { cards: Card[] | null; produced: (cards: Card[]) => void } {
  const key = words.join(",");
  const mine = useRef<{ key: string; cards: Card[] } | null>(null);
  const cards = useMemo(() => {
    if (mine.current?.key === key) return mine.current.cards;
    const made = words.map(wordToCard);
    return made.every((c): c is Card => c !== null) ? (made as Card[]) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    cards,
    produced: (next) => {
      mine.current = { key: next.map((c) => c.word).join(","), cards: next };
    },
  };
}

/** The tray as the builder wants it: kinds with their parameters. Words that are not a Course 1 card are left out. */
function trayOf(words: number[], hideEnd: boolean): TrayItem[] {
  const items: TrayItem[] = [];
  for (const word of words) {
    const card = wordToCard(word);
    if (card && card.kind !== "custom" && !(hideEnd && card.kind === "stop")) items.push({ kind: card.kind, params: card.params });
  }
  return items;
}

/** `builder`: drag cards from the tray into the program. The program becomes the player's cards. */
export function BuilderPanel({ cards: words, tray, hideEnd, readOnly, onReplace }: { cards: number[]; tray: number[]; hideEnd: boolean; readOnly: boolean; onReplace: (words: number[]) => void }) {
  const { cards, produced } = useBuilderCards(words);
  const items = useMemo(() => trayOf(tray, hideEnd), [tray, hideEnd]);
  const root = useRef<HTMLDivElement>(null);
  // Locked (or being demonstrated by the ghost): still drawn, but nothing in it can be reached or changed.
  useEffect(() => {
    if (root.current) root.current.inert = readOnly;
  }, [readOnly]);
  return (
    <div ref={root} data-builder data-locked={readOnly || undefined} className="rounded-lg border bg-card p-4 text-card-foreground">
      {cards === null ? (
        <p>These cards cannot be shown in the builder.</p>
      ) : (
        <Suspense fallback={<p>Loading the builder.</p>}>
          <ProgramBuilder
            cards={cards}
            tray={items}
            hideEnd={hideEnd}
            coachIds
            onChange={(next) => {
              produced(next);
              onReplace(next.map(cardToWord));
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

