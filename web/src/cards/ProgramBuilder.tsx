import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, Copy, GripVertical, Redo2, Trash2, Undo2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEventHandler } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { buildProgram, jumpProblem } from "./build";
import { CardContent, CardFace } from "./CardFace";
import {
  DEFAULT_BOXES,
  MAX_CARDS,
  MAX_CUSTOM_CARDS,
  SCREEN_SIZE,
  SCREEN_START,
  cardText,
  customBodyProblem,
  customCard,
  customSlot,
  makeCard,
  nameProblem,
  normalizeName,
  type Card,
  type CardKind,
  type CardParams,
  type CustomCard,
} from "./model";

/** One kind of card offered in the tray, with the parameters a new card starts with. */
export interface TrayItem {
  kind: Exclude<CardKind, "custom">;
  params?: CardParams;
}

export const DEFAULT_TRAY: TrayItem[] = [
  { kind: "put" },
  { kind: "add-number" },
  { kind: "add-boxes" },
  { kind: "subtract-boxes" },
  { kind: "multiply" },
  { kind: "stop" },
];

export interface ProgramBuilderProps {
  /**
   * The program (controlled). Every change goes through `onChange`. Give a new array only when the
   * program really changes: a `cards` array the builder did not produce (a loaded program) starts a fresh undo history.
   */
  cards: Card[];
  onChange: (cards: Card[]) => void;
  /** The card kinds offered, with their starting parameters. Custom cards are added to the tray automatically. */
  tray?: TrayItem[];
  /** Hide the final Stop: the list shows "the end of the list" and the program still halts (default true). */
  hideEnd?: boolean;
  /** The most cards the list may hold (default and ceiling: 200). */
  maxCards?: number;
  /** Custom cards (functions). Giving `onCustomCardsChange` turns on Select and Save as card. */
  customCards?: CustomCard[];
  onCustomCardsChange?: (customCards: CustomCard[]) => void;
  /** Show the faint assembly chip on cards. */
  showAssembly?: boolean;
  /** Let the student change boxes with pickers (numbers are always editable). */
  editableBoxes?: boolean;
  boxes?: string[];
  className?: string;
}

const HISTORY_LIMIT = 100;
const iconButton = "text-muted-foreground hover:text-foreground aria-disabled:opacity-50";

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

interface Snapshot {
  cards: Card[];
  customCards: CustomCard[];
}

type FocusTarget = { row: Card } | "tray";

/** The shelf warning: a save onto an address the program itself occupies. */
function shelfProblem(card: Card, imageBytes: number): string | null {
  if (card.kind !== "save" && card.kind !== "save-byte") return null;
  const address = card.params.address ?? 0;
  if (address >= SCREEN_START && address < SCREEN_START + SCREEN_SIZE) return null; // a pixel
  return address < imageBytes ? "This shelf holds your program. Saving there would change it." : null;
}

function TrayCard({ card, index, label, customCards }: { card: Card; index: number; label: string; customCards: CustomCard[] }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `tray:${index}` });
  return (
    <li>
      <div
        ref={setNodeRef}
        data-testid="tray-card"
        role="button"
        tabIndex={0}
        aria-label={label}
        data-tray-index={index}
        // Only the pointer starts a drag from the tray: Enter adds the card (see the builder's onKeyDown).
        onPointerDown={listeners?.["onPointerDown"] as PointerEventHandler<HTMLDivElement> | undefined}
        className={cn(
          "cursor-grab touch-none select-none rounded-md border bg-editor px-3 py-2 text-sm text-editor-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          isDragging && "opacity-50",
        )}
      >
        <CardContent card={card} customCards={customCards} />
      </div>
    </li>
  );
}

interface RowProps {
  id: string;
  card: Card;
  index: number;
  count: number;
  selecting: boolean;
  selected: boolean;
  showAssembly: boolean;
  editableBoxes: boolean;
  boxes: string[];
  customCards: CustomCard[];
  warnings: { jump: string | null; shelf: string | null };
  onSelect: (selected: boolean) => void;
  onEdit: (card: Card) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function Row({ id, card, index, count, selecting, selected, warnings, onSelect, onEdit, onMove, onDuplicate, onRemove, ...face }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `row:${id}` });
  const n = index + 1;
  return (
    <li
      ref={setNodeRef}
      data-testid="program-card"
      data-row-id={id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-1", isDragging && "relative z-10 opacity-80")}
    >
      {selecting ? (
        <Checkbox aria-label={`Select card ${n}`} checked={selected} onCheckedChange={(value) => onSelect(value === true)} className="mr-1 mt-3 shrink-0" />
      ) : null}
      <Button variant="ghost" size="icon-sm" className={cn("mt-1.5 shrink-0 cursor-grab touch-none", iconButton)} aria-label={`Drag card ${n}`} {...attributes} {...listeners}>
        <GripVertical />
      </Button>
      <div className="min-w-0 flex-1 space-y-1">
        <CardFace
          card={card}
          onChange={onEdit}
          position={{ index, count }}
          showAssembly={face.showAssembly}
          editableBoxes={face.editableBoxes}
          boxes={face.boxes}
          customCards={face.customCards}
        />
        {warnings.jump ? (
          <p data-testid="jump-warning" className="text-xs text-warning-fg">
            {warnings.jump}
          </p>
        ) : null}
        {warnings.shelf ? (
          <p data-testid="shelf-warning" className="text-xs text-warning-fg">
            {warnings.shelf}
          </p>
        ) : null}
      </div>
      <div className="mt-1.5 flex shrink-0 gap-0.5">
        {/* aria-disabled, not disabled: a button that has just moved the card to an end keeps keyboard focus. */}
        <Button variant="ghost" size="icon-sm" className={iconButton} aria-label={`Move card ${n} up`} aria-disabled={index === 0 || undefined} onClick={() => index > 0 && onMove(-1)}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" className={iconButton} aria-label={`Move card ${n} down`} aria-disabled={index === count - 1 || undefined} onClick={() => index < count - 1 && onMove(1)}>
          <ArrowDown />
        </Button>
        <Button variant="ghost" size="icon-sm" className={iconButton} aria-label={`Duplicate card ${n}`} onClick={onDuplicate}>
          <Copy />
        </Button>
        <Button variant="ghost" size="icon-sm" className={iconButton} aria-label={`Remove card ${n}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function EndRow({ hideEnd, empty }: { hideEnd: boolean; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "end" });
  return (
    <li data-testid={hideEnd ? "end-marker" : "drop-row"}>
      <div
        ref={setNodeRef}
        data-testid="drop-end"
        className={cn(
          "rounded-md border border-dashed px-3 py-2 text-center text-sm text-muted-foreground transition-colors",
          isOver && "border-solid bg-accent text-accent-foreground",
        )}
      >
        {empty ? "Drag a card here, or press Enter on a card in the tray. " : null}
        {hideEnd ? "The end of the list" : empty ? null : "Drop a card here"}
      </div>
    </li>
  );
}

function NameDialog({
  taken,
  slot,
  onSave,
  onCancel,
  onClosed,
}: {
  taken: string[];
  slot: string;
  onSave: (name: string) => void;
  onCancel: () => void;
  onClosed: (event: Event) => void;
}) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent onCloseAutoFocus={onClosed}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const found = nameProblem(name, taken);
            if (found) setProblem(found);
            else onSave(normalizeName(name));
          }}
        >
          <DialogHeader>
            <DialogTitle>Save as a new card</DialogTitle>
            <DialogDescription>
              The new card {slot}. Convention: the input goes in box a0 and the answer comes back in box a0; boxes t0 to
              t2 may be used as scratch (the program&apos;s own t0 to t2 are not kept).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={id}>Card name</Label>
            <Input
              id={id}
              value={name}
              autoFocus
              aria-invalid={problem ? true : undefined}
              onChange={(event) => {
                setName(event.target.value);
                setProblem(null);
              }}
            />
            {problem ? (
              <p role="alert" className="text-sm text-danger-fg">
                {problem}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">Save card</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The drag-and-drop program builder. A tray of card kinds and the program list. Drag from the tray,
 * reorder by dragging, remove, duplicate, undo and redo (Ctrl or Cmd+Z); each also works from the
 * keyboard (Enter on a tray card adds it; the drag handle lifts with Space and moves with the arrows)
 * and with buttons. Select two or more neighbouring cards and "Save as card" to make a custom card.
 * Undo and redo cover the program and the custom cards together (the last 100 changes).
 */
export function ProgramBuilder({
  cards,
  onChange,
  tray = DEFAULT_TRAY,
  hideEnd = true,
  maxCards = MAX_CARDS,
  customCards = [],
  onCustomCardsChange,
  showAssembly = false,
  editableBoxes = false,
  boxes = DEFAULT_BOXES,
  className,
}: ProgramBuilderProps) {
  const limit = Math.min(maxCards, MAX_CARDS);
  const root = useRef<HTMLDivElement>(null);
  const history = useRef<{ past: Snapshot[]; future: Snapshot[] }>({ past: [], future: [] });
  const expected = useRef(cards);
  // A program the builder did not produce (a loaded one) starts a fresh history.
  if (cards !== expected.current) {
    history.current = { past: [], future: [] };
    expected.current = cards;
  }
  const [, redraw] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [naming, setNaming] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  // Stable identities for the rows, so focus, drags and animations follow a card when it moves.
  const ids = useRef(new WeakMap<Card, string>());
  const counter = useRef(0);
  const idOf = (card: Card): string => {
    let id = ids.current.get(card);
    if (!id) {
      id = `c${++counter.current}`;
      ids.current.set(card, id);
    }
    return id;
  };
  const rowIds = cards.map(idOf);

  // Where keyboard focus goes after a change that removes the element that had it.
  const focusNext = useRef<FocusTarget | null>(null);
  const afterDialog = useRef<FocusTarget | null>(null);
  const applyFocus = (target: FocusTarget) => {
    const el =
      target === "tray"
        ? root.current?.querySelector<HTMLElement>("[data-tray-index]")
        : root.current?.querySelector<HTMLElement>(`[data-row-id="${idOf(target.row)}"] [data-testid="card-face"]`);
    el?.focus();
  };
  useEffect(() => {
    if (focusNext.current) {
      applyFocus(focusNext.current);
      focusNext.current = null;
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const trayCards = [
    ...tray.filter((item) => !(hideEnd && item.kind === "stop")).map((item) => makeCard(item.kind, item.params)),
    ...customCards.map((c) => customCard(c.name)),
  ];
  const full = `The list is full: ${limit} cards is the most. Remove one to make room.`;
  const built = buildProgram(cards, customCards);
  const imageBytes = (built.words.length || cards.length + 1) * 4;

  const snapshot = (): Snapshot => ({ cards, customCards });
  /** Every change to the program (and optionally the custom cards) goes through here, so undo and redo see it. */
  const commit = (next: Card[], nextCustom?: CustomCard[]) => {
    const past = history.current.past;
    past.push(snapshot());
    if (past.length > HISTORY_LIMIT) past.shift();
    history.current.future = [];
    setSelected([]);
    setMessage(null);
    redraw((n) => n + 1);
    expected.current = next;
    if (nextCustom) onCustomCardsChange?.(nextCustom);
    onChange(next);
  };
  const restore = (to: Snapshot) => {
    setSelected([]);
    setMessage(null);
    redraw((n) => n + 1);
    expected.current = to.cards;
    if (to.customCards !== customCards) onCustomCardsChange?.(to.customCards);
    onChange(to.cards);
  };
  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(snapshot());
    restore(previous);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(snapshot());
    restore(next);
  };
  const latest = useRef({ undo, redo });
  latest.current = { undo, redo };

  // Ctrl or Cmd+Z works wherever focus is (even nowhere) while this builder is on the page, except in a text box.
  useEffect(() => {
    const onDocumentKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = document.activeElement as HTMLElement | null;
      if (target && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (target && target !== document.body && !root.current?.contains(target)) return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) latest.current.redo();
      else latest.current.undo();
    };
    document.addEventListener("keydown", onDocumentKey);
    return () => document.removeEventListener("keydown", onDocumentKey);
  }, []);

  const fresh = (card: Card): Card => ({ ...card, params: { ...card.params } });
  const insert = (card: Card, at = cards.length) => {
    if (cards.length >= limit) return setMessage(full);
    commit([...cards.slice(0, at), fresh(card), ...cards.slice(at)]);
  };
  const edit = (index: number, next: Card) => {
    // The edited card keeps its row identity, so the number box keeps focus while the student types.
    ids.current.set(next, idOf(cards[index]!));
    commit(cards.map((c, j) => (j === index ? next : c)));
  };
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= cards.length) return;
    const next = cards.slice();
    next.splice(to, 0, next.splice(from, 1)[0]!);
    commit(next);
  };
  const remove = (index: number) => {
    const neighbour = cards[index + 1] ?? cards[index - 1];
    focusNext.current = neighbour ? { row: neighbour } : "tray";
    commit(cards.filter((_, j) => j !== index));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Enter" && target.dataset["trayIndex"] !== undefined) {
      event.preventDefault();
      insert(trayCards[Number(target.dataset["trayIndex"])]!);
    }
  };

  const indexOfRow = (id: string | number): number => rowIds.indexOf(String(id).slice(4));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const from = String(active.id);
    const to = String(over.id);
    if (from.startsWith("tray:")) {
      const card = trayCards[Number(from.slice(5))];
      if (!card) return;
      insert(card, to.startsWith("row:") ? indexOfRow(to) : cards.length);
    } else if (from.startsWith("row:") && to.startsWith("row:")) {
      reorder(indexOfRow(from), indexOfRow(to));
    }
  };

  const describeId = (id: string | number): string => {
    const key = String(id);
    if (key.startsWith("tray:")) {
      const card = trayCards[Number(key.slice(5))];
      return card ? `the card ${cardText(card, { customCards }).text}` : "a card";
    }
    const index = indexOfRow(key);
    return index >= 0 ? `card ${index + 1}, ${cardText(cards[index]!, { customCards }).text}` : "a card";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describeId(active.id)}.`,
    onDragOver: ({ over }) => (over ? (String(over.id) === "end" ? "Over the end of the list." : `Over card ${indexOfRow(over.id) + 1}.`) : "Not over the list."),
    onDragEnd: ({ active, over }) => {
      if (!over) return "Dropped outside the list. Nothing changed.";
      const fromTray = String(active.id).startsWith("tray:");
      const position = String(over.id).startsWith("row:") ? indexOfRow(over.id) + 1 : cards.length + (fromTray ? 1 : 0);
      return `Dropped at position ${position} of ${cards.length + (fromTray ? 1 : 0)}.`;
    },
    onDragCancel: () => "Cancelled. Nothing changed.",
  };

  const picked = () => selected.slice().sort((a, b) => a - b);
  const saveAsCard = () => {
    const chosen = picked();
    if (chosen.length < 2) return setMessage("Pick two or more cards first.");
    if (chosen.some((index, i) => i > 0 && index !== chosen[i - 1]! + 1)) return setMessage("Pick cards that sit next to each other.");
    const problem = customBodyProblem(chosen.map((i) => cards[i]!));
    if (problem) return setMessage(problem);
    if (customCards.length >= MAX_CUSTOM_CARDS) return setMessage(`You can make up to ${MAX_CUSTOM_CARDS} custom cards.`);
    setMessage(null);
    setNaming(true);
  };
  const saveNamed = (name: string) => {
    const chosen = picked();
    const definition: CustomCard = { name, cards: chosen.map((i) => cards[i]!) };
    const replacement = customCard(name);
    afterDialog.current = { row: replacement };
    commit(
      [...cards.slice(0, chosen[0]!), replacement, ...cards.slice(chosen[chosen.length - 1]! + 1)],
      [...customCards, definition],
    );
    setNaming(false);
    setSelecting(false);
    focusNext.current = { row: replacement };
  };

  const missingStop = !hideEnd && cards.length > 0 && !cards.some((c) => c.kind === "stop");
  const activeTray = dragging?.startsWith("tray:") ? trayCards[Number(dragging.slice(5))] : undefined;
  const chosen = picked();
  const slotPreview =
    chosen.length >= 2 ? customSlot({ name: "", cards: chosen.map((i) => cards[i]!) }) : "uses box a0, answer in box a0";

  return (
    // The wrapper only listens for keys that bubble up from the tray; undo and redo listen on the document.
    <div ref={root} className={cn("grid gap-4 md:grid-cols-[minmax(14rem,20rem)_1fr]", className)} onKeyDown={onKeyDown}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: "To lift a card, press Space. Use the arrow keys to move it, Space to drop it, Escape to cancel." },
        }}
        onDragStart={({ active }) => setDragging(String(active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <section aria-label="Card tray" className="min-w-0 space-y-2">
          <h3 className="text-sm font-medium">Cards</h3>
          <p className="text-xs text-muted-foreground">Drag a card to the list, or focus it and press Enter.</p>
          <ul data-testid="tray" className="space-y-2">
            {trayCards.map((card, i) => (
              <TrayCard key={`${card.kind}:${card.params.name ?? i}`} card={card} index={i} customCards={customCards} label={cardText(card, { customCards }).text} />
            ))}
          </ul>
        </section>

        <section aria-label="Your program" className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-sm font-medium">Program</h3>
            <Button variant="outline" size="sm" onClick={undo} disabled={history.current.past.length === 0}>
              <Undo2 /> Undo
            </Button>
            <Button variant="outline" size="sm" onClick={redo} disabled={history.current.future.length === 0}>
              <Redo2 /> Redo
            </Button>
            {onCustomCardsChange ? (
              <>
                <Button
                  variant={selecting ? "secondary" : "outline"}
                  size="sm"
                  aria-pressed={selecting}
                  onClick={() => {
                    setSelecting(!selecting);
                    setSelected([]);
                  }}
                >
                  Select
                </Button>
                {selecting ? (
                  <Button size="sm" onClick={saveAsCard} disabled={selected.length < 2}>
                    Save as card
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>

          {message ? (
            <p data-testid="builder-message" role="status" className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
              {message}
            </p>
          ) : null}
          {missingStop ? (
            <p data-testid="builder-warning" role="status" className="rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-fg">
              There is no Stop card yet. Add one at the end so the machine knows where to finish.
            </p>
          ) : null}

          <SortableContext items={rowIds.map((id) => `row:${id}`)} strategy={verticalListSortingStrategy}>
            <ol aria-label="Program" className="space-y-2">
              {cards.map((card, i) => (
                <Row
                  key={rowIds[i]}
                  id={rowIds[i]!}
                  card={card}
                  index={i}
                  count={cards.length}
                  selecting={selecting}
                  selected={selected.includes(i)}
                  showAssembly={showAssembly}
                  editableBoxes={editableBoxes}
                  boxes={boxes}
                  customCards={customCards}
                  warnings={{ jump: jumpProblem(cards, i), shelf: shelfProblem(card, imageBytes) }}
                  onSelect={(on) => setSelected(on ? [...selected, i] : selected.filter((s) => s !== i))}
                  onEdit={(next) => edit(i, next)}
                  onMove={(delta) => reorder(i, i + delta)}
                  onDuplicate={() => insert(card, i + 1)}
                  onRemove={() => remove(i)}
                />
              ))}
              <EndRow hideEnd={hideEnd} empty={cards.length === 0} />
            </ol>
          </SortableContext>
        </section>
        <DragOverlay>
          {activeTray ? (
            <div className="rounded-md border bg-editor px-3 py-2 text-sm text-editor-foreground shadow-lg">
              <CardContent card={activeTray} customCards={customCards} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {naming ? (
        <NameDialog
          taken={customCards.map((c) => c.name)}
          slot={slotPreview}
          onSave={saveNamed}
          onCancel={() => setNaming(false)}
          onClosed={(event) => {
            // After saving, focus goes to the new card, not back to the Save button that has just gone.
            if (afterDialog.current) {
              event.preventDefault();
              applyFocus(afterDialog.current);
              afterDialog.current = null;
            }
          }}
        />
      ) : null}
    </div>
  );
}
