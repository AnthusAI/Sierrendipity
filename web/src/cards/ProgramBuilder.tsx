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
import { useId, useRef, useState, type KeyboardEvent, type PointerEventHandler } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CardContent, CardFace } from "./CardFace";
import {
  CUSTOM_SLOT,
  DEFAULT_BOXES,
  MAX_CUSTOM_CARDS,
  cardText,
  customBodyProblem,
  customCard,
  makeCard,
  nameProblem,
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
  /** The program (controlled). Every change goes through `onChange`. */
  cards: Card[];
  onChange: (cards: Card[]) => void;
  /** The card kinds offered, with their starting parameters. Custom cards are added to the tray automatically. */
  tray?: TrayItem[];
  /** Hide the final Stop: the list shows "the end of the list" and the program still halts (default true). */
  hideEnd?: boolean;
  /** The most cards the list may hold. */
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

const iconButton = "text-muted-foreground hover:text-foreground";

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

function TrayCard({ card, index, label }: { card: Card; index: number; label: string }) {
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
        // Only the pointer starts a drag from the tray: Enter adds the card (see the list's onKeyDown).
        onPointerDown={listeners?.["onPointerDown"] as PointerEventHandler<HTMLDivElement> | undefined}
        className={cn(
          "cursor-grab touch-none select-none rounded-md border bg-editor px-3 py-2 text-sm text-editor-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          isDragging && "opacity-50",
        )}
      >
        <CardContent card={card} />
      </div>
    </li>
  );
}

interface RowProps {
  card: Card;
  index: number;
  count: number;
  selecting: boolean;
  selected: boolean;
  showAssembly: boolean;
  editableBoxes: boolean;
  boxes: string[];
  customCards: CustomCard[];
  onSelect: (selected: boolean) => void;
  onEdit: (card: Card) => void;
  onMove: (delta: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function Row({ card, index, count, selecting, selected, onSelect, onEdit, onMove, onDuplicate, onRemove, ...face }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `row-${index}` });
  const n = index + 1;
  return (
    <li
      ref={setNodeRef}
      data-testid="program-card"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-1", isDragging && "relative z-10 opacity-80")}
    >
      {selecting ? (
        <Checkbox aria-label={`Select card ${n}`} checked={selected} onCheckedChange={(value) => onSelect(value === true)} className="mt-3 mr-1" />
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn("mt-1.5 cursor-grab touch-none", iconButton)}
        aria-label={`Drag card ${n}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      <CardFace
        card={card}
        onChange={onEdit}
        className="min-w-0 flex-1"
        showAssembly={face.showAssembly}
        editableBoxes={face.editableBoxes}
        boxes={face.boxes}
        customCards={face.customCards}
      />
      <div className="mt-1.5 flex gap-0.5">
        <Button variant="ghost" size="icon-sm" className={iconButton} aria-label={`Move card ${n} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon-sm" className={iconButton} aria-label={`Move card ${n} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
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

function NameDialog({ taken, onSave, onCancel }: { taken: string[]; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const found = nameProblem(name, taken);
            if (found) setProblem(found);
            else onSave(name.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>Save as a new card</DialogTitle>
            <DialogDescription>
              The new card {CUSTOM_SLOT}. Its input goes in box a0 and its answer comes back in box a0.
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
 */
export function ProgramBuilder({
  cards,
  onChange,
  tray = DEFAULT_TRAY,
  hideEnd = true,
  maxCards = Infinity,
  customCards = [],
  onCustomCardsChange,
  showAssembly = false,
  editableBoxes = false,
  boxes = DEFAULT_BOXES,
  className,
}: ProgramBuilderProps) {
  const history = useRef<{ past: Card[][]; future: Card[][] }>({ past: [], future: [] });
  const [, redraw] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [naming, setNaming] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const trayCards = [
    ...tray.filter((item) => !(hideEnd && item.kind === "stop")).map((item) => makeCard(item.kind, item.params)),
    ...customCards.map((c) => customCard(c.name)),
  ];
  const full = `The list is full: ${maxCards} cards is the most. Remove one to make room.`;

  /** Every change to the program goes through here, so undo and redo see it. */
  const commit = (next: Card[]) => {
    history.current.past.push(cards);
    history.current.future = [];
    setSelected([]);
    setMessage(null);
    redraw((n) => n + 1);
    onChange(next);
  };
  const insert = (card: Card, at = cards.length) => {
    if (cards.length >= maxCards) return setMessage(full);
    commit([...cards.slice(0, at), card, ...cards.slice(at)]);
  };
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= cards.length) return;
    const next = cards.slice();
    next.splice(to, 0, next.splice(from, 1)[0]!);
    commit(next);
  };
  const undo = () => {
    const previous = history.current.past.pop();
    if (!previous) return;
    history.current.future.push(cards);
    setSelected([]);
    setMessage(null);
    redraw((n) => n + 1);
    onChange(previous);
  };
  const redo = () => {
    const next = history.current.future.pop();
    if (!next) return;
    history.current.past.push(cards);
    setSelected([]);
    setMessage(null);
    redraw((n) => n + 1);
    onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA") return;
    if (event.key === "Enter" && target.dataset["trayIndex"] !== undefined) {
      event.preventDefault();
      insert(trayCards[Number(target.dataset["trayIndex"])]!);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    }
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const from = String(active.id);
    const to = String(over.id);
    if (from.startsWith("tray:")) {
      const card = trayCards[Number(from.slice(5))];
      if (!card) return;
      insert(card, to.startsWith("row-") ? Number(to.slice(4)) : cards.length);
    } else if (from.startsWith("row-") && to.startsWith("row-")) {
      reorder(Number(from.slice(4)), Number(to.slice(4)));
    }
  };

  const describeId = (id: string | number): string => {
    const key = String(id);
    if (key.startsWith("tray:")) {
      const card = trayCards[Number(key.slice(5))];
      return card ? `the card ${cardText(card).text}` : "a card";
    }
    const card = cards[Number(key.slice(4))];
    return card ? `card ${Number(key.slice(4)) + 1}, ${cardText(card).text}` : "a card";
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${describeId(active.id)}.`,
    onDragOver: ({ over }) => (over ? (String(over.id) === "end" ? "Over the end of the list." : `Over card ${Number(String(over.id).slice(4)) + 1}.`) : "Not over the list."),
    onDragEnd: ({ over }) => (over ? "Dropped." : "Dropped outside the list. Nothing changed."),
    onDragCancel: () => "Cancelled. Nothing changed.",
  };

  const saveAsCard = () => {
    const picked = selected.slice().sort((a, b) => a - b);
    if (picked.length < 2) return setMessage("Pick two or more cards first.");
    if (picked.some((index, i) => i > 0 && index !== picked[i - 1]! + 1)) return setMessage("Pick cards that sit next to each other.");
    const problem = customBodyProblem(picked.map((i) => cards[i]!));
    if (problem) return setMessage(problem);
    if (customCards.length >= MAX_CUSTOM_CARDS) return setMessage(`You can make up to ${MAX_CUSTOM_CARDS} custom cards.`);
    setMessage(null);
    setNaming(true);
  };
  const saveNamed = (name: string) => {
    const picked = selected.slice().sort((a, b) => a - b);
    onCustomCardsChange?.([...customCards, { name, cards: picked.map((i) => cards[i]!) }]);
    commit([...cards.slice(0, picked[0]!), customCard(name), ...cards.slice(picked[picked.length - 1]! + 1)]);
    setNaming(false);
    setSelecting(false);
  };

  const missingStop = !hideEnd && cards.length > 0 && !cards.some((c) => c.kind === "stop");
  const ids = cards.map((_, i) => `row-${i}`);
  const activeTray = dragging?.startsWith("tray:") ? trayCards[Number(dragging.slice(5))] : undefined;

  return (
    // The wrapper only listens for keys that bubble up from the tray, the rows and the toolbar.
    <div className={cn("grid gap-4 md:grid-cols-[minmax(14rem,20rem)_1fr]", className)} onKeyDown={onKeyDown}>
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
        <section aria-label="Card tray" className="space-y-2">
          <h3 className="text-sm font-medium">Cards</h3>
          <p className="text-xs text-muted-foreground">Drag a card to the list, or focus it and press Enter.</p>
          <ul data-testid="tray" className="space-y-2">
            {trayCards.map((card, i) => (
              <TrayCard key={`${card.kind}:${card.params.name ?? i}`} card={card} index={i} label={cardText(card).text} />
            ))}
          </ul>
        </section>

        <section aria-label="Your program" className="space-y-2">
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

          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol aria-label="Program" className="space-y-2">
              {cards.map((card, i) => (
                <Row
                  key={i}
                  card={card}
                  index={i}
                  count={cards.length}
                  selecting={selecting}
                  selected={selected.includes(i)}
                  showAssembly={showAssembly}
                  editableBoxes={editableBoxes}
                  boxes={boxes}
                  customCards={customCards}
                  onSelect={(on) => setSelected(on ? [...selected, i] : selected.filter((s) => s !== i))}
                  onEdit={(next) => commit(cards.map((c, j) => (j === i ? next : c)))}
                  onMove={(delta) => reorder(i, i + delta)}
                  onDuplicate={() => insert(card, i + 1)}
                  onRemove={() => commit(cards.filter((_, j) => j !== i))}
                />
              ))}
              <EndRow hideEnd={hideEnd} empty={cards.length === 0} />
            </ol>
          </SortableContext>
        </section>
        <DragOverlay>
          {activeTray ? (
            <div className="rounded-md border bg-editor px-3 py-2 text-sm text-editor-foreground shadow-lg">
              <CardContent card={activeTray} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {naming ? <NameDialog taken={customCards.map((c) => c.name)} onSave={saveNamed} onCancel={() => setNaming(false)} /> : null}
    </div>
  );
}
