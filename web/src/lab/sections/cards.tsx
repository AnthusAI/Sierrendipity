import { assemble } from "@sierrendipity/explorer";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CardFace,
  ProgramBuilder,
  buildProgram,
  cardToWord,
  makeCard,
  programFromJson,
  programToJson,
  runWords,
  wordToCard,
  type Card,
  type CustomCard,
  type TrayItem,
} from "@/cards";

export const title = "Cards and builder";

/** The Course 1 cards, written as assembly so the gallery proves each word turns back into its card. */
const GALLERY = [
  "addi a0, zero, 5",
  "addi a0, a0, 3",
  "add a2, a0, a1",
  "sub a2, a0, a1",
  "mul a0, a0, a0",
  "mul a2, a0, a1",
  "sb a1, 1024(zero)",
  "sb a1, 100(zero)",
  "sw a0, 100(zero)",
  "lw a0, 100(zero)",
  "bne a0, a1, -8",
  "bne a0, a1, 8",
  "blt a0, a1, -4",
  "blt a0, a1, 8",
  "ebreak",
];

const hex = (word: number) => `0x${(word >>> 0).toString(16).padStart(8, "0")}`;

const TRAY: TrayItem[] = [
  { kind: "put" },
  { kind: "add-number" },
  { kind: "add-boxes" },
  { kind: "subtract-boxes" },
  { kind: "multiply" },
  { kind: "jump-if-different" },
  { kind: "stop" },
];

const BOXES = ["a0", "a1", "a2", "a3", "ra"];

const gallery = GALLERY.map((source) => {
  const word = assemble(source).words[0]!;
  const card = wordToCard(word);
  const roundtrip = card !== null && cardToWord(card) === word && JSON.stringify(makeCard(card.kind, card.params)) === JSON.stringify(card);
  return { word, card, roundtrip };
});

const squareAndAddOne: CustomCard = {
  name: "Square-and-add-one",
  cards: [makeCard("multiply"), makeCard("add-number", { n: 1 })],
};

export default function CardsSection() {
  const [cards, setCards] = useState<Card[]>([]);
  const [customCards, setCustomCards] = useState<CustomCard[]>([]);
  const [hideEnd, setHideEnd] = useState(true);
  const [showAssembly, setShowAssembly] = useState(false);
  const [maxCards, setMaxCards] = useState(20);
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const built = useMemo(() => buildProgram(cards, customCards), [cards, customCards]);
  const run = useMemo(() => runWords(built.words), [built]);
  const json = draft ?? programToJson(cards, customCards);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="font-medium">Gallery</h3>
        <ul data-testid="gallery" className="grid gap-2 sm:grid-cols-2">
          {gallery.map(({ word, card, roundtrip }) => (
            <li key={word + String(card?.params.address)} data-testid="gallery-item" data-roundtrip={roundtrip ? "ok" : "broken"} className="space-y-1">
              {card ? <CardFace card={card} showAssembly /> : null}
              <code data-testid="gallery-word" className="text-xs text-muted-foreground">
                {hex(word)}
              </code>
            </li>
          ))}
        </ul>
        <h4 className="text-sm font-medium">A custom card</h4>
        <div className="max-w-sm">
          <CardFace card={makeCard("custom", { name: squareAndAddOne.name })} customCards={[squareAndAddOne]} />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">Builder</h3>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Label className="flex items-center gap-2">
            <Checkbox checked={showAssembly} onCheckedChange={(on) => setShowAssembly(on === true)} /> Show assembly
          </Label>
          <Label className="flex items-center gap-2">
            <Checkbox checked={hideEnd} onCheckedChange={(on) => setHideEnd(on === true)} /> Hide the Stop card
          </Label>
          <Label className="flex items-center gap-2">
            Maximum cards
            <Input
              type="number"
              min={1}
              max={99}
              className="h-8 w-20"
              value={maxCards}
              onChange={(event) => setMaxCards(Math.max(1, Number(event.target.value) || 1))}
            />
          </Label>
        </div>
        <ProgramBuilder
          cards={cards}
          onChange={(next) => {
            setDraft(null);
            setCards(next);
          }}
          tray={TRAY}
          hideEnd={hideEnd}
          maxCards={maxCards}
          customCards={customCards}
          onCustomCardsChange={setCustomCards}
          showAssembly={showAssembly}
          editableBoxes
          boxes={BOXES}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <h3 className="font-medium">Program words</h3>
          {built.errors.length > 0 ? (
            <p role="alert" className="text-sm text-danger-fg">
              {built.errors.join(" ")}
            </p>
          ) : null}
          <ol data-testid="words" aria-label="Program words" className="font-mono text-xs">
            {built.words.map((word, i) => (
              <li key={i}>{hex(word)}</li>
            ))}
          </ol>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Machine result</h3>
          <p className="text-sm">
            Machine <span data-testid="machine-state">{built.words.length === 0 ? "nothing to run" : run.state}</span>
          </p>
          <dl data-testid="boxes" className="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-sm">
            {BOXES.map((box, i) => (
              <div key={box} className="contents">
                <dt className="text-muted-foreground">{box}</dt>
                <dd data-box={box}>{run.regs[[10, 11, 12, 13, 1][i]!]}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-2">
          <h3 className="font-medium">Machine trace</h3>
          <ol data-testid="trace" aria-label="Machine trace" className="font-mono text-xs">
            {run.trace.map((entry, i) => (
              <li key={i}>
                {hex(entry.pc)} {entry.text}
                {entry.changed.map((c) => ` ${c.box} = ${c.value}`).join("")}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Saved program</h3>
        <textarea
          aria-label="Program JSON"
          className="h-40 w-full rounded-md border border-input bg-background p-2 font-mono text-xs"
          value={json}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              try {
                const loaded = programFromJson(json);
                setCards(loaded.cards);
                setCustomCards(loaded.customCards);
                setDraft(null);
                setProblem(null);
              } catch (error) {
                setProblem((error as Error).message);
              }
            }}
          >
            Load JSON
          </Button>
          {problem ? (
            <p data-testid="lab-message" role="status" className="text-sm text-danger-fg">
              {problem}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
