import { describe } from "@sierrendipity/explorer";
import { useEffect, type ReactNode } from "react";
import { CardFace } from "../cards/CardFace";
import { cardToWord, wordToCard } from "../cards/model";
import { HeartbeatView, MachineView, PixelDisplay, PointerWalk, useMachineTimeline, type MachineTimeline } from "../diagrams";
import { PlayerControls } from "./PlayerControls";
import { BandsPanel, BuilderPanel, CarryPanel, FlipPanel, LampsPanel } from "./StageWidgets";
import type { Stage, StageProps } from "./types";

/** The scene `show` ids that draw their own widget. The machine view (D1) is on unless a scene shows only these. */
const WIDGETS = ["D3", "D4", "D5", "D6", "D7", "D8", "D9", "builder"];

const hex = (word: number) => `0x${(word >>> 0).toString(16).padStart(8, "0")}`;

/**
 * Keep the timeline where the player is. The player owns the one live machine; the diagram only draws it. A new
 * program restarts the timeline by itself; a forward step of the player replays as an animated step, and
 * Back, Reset or a jump simply seek.
 */
function useFollow(timeline: MachineTimeline, steps: number, programKey: string) {
  const target = Math.min(steps, timeline.length);
  const { position, stepForward, seek } = timeline;
  useEffect(() => {
    if (position === target) return;
    if (target === position + 1) stepForward();
    else seek(target);
    // Only when the player's step count or program changes, never because the timeline moved by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, timeline.length, programKey]);
}

/** One card of the list: a real face with a number spinner, or a plain face for a word that is not a Course 1 card. */
function Face({ word, index, count, current, locked, onEdit }: { word: number; index: number; count: number; current: boolean; locked: boolean; onEdit: (card: number, word: number) => void }) {
  const card = wordToCard(word);
  const highlight = current ? "border-foreground ring-2 ring-foreground" : "";
  if (!card) {
    const text = describe(word, { vocabulary: "boxes" }).text;
    return (
      <div role="group" tabIndex={0} aria-label={text} className={`min-w-0 rounded-md border bg-editor px-3 py-2 text-sm text-editor-foreground [overflow-wrap:anywhere] ${highlight}`}>
        {text}
      </div>
    );
  }
  return (
    <CardFace
      card={card}
      position={{ index, count }}
      numberLabel={`Number on card ${index + 1}`}
      locked={locked}
      className={highlight}
      onChange={(next) => onEdit(index, cardToWord(next))}
    />
  );
}

/**
 * The real stage: the clerk and boxes (D1) with number spinners on real card faces, and the other diagrams a
 * scene asks for (`show`): heartbeat D3, bit lamps D4, card flip D5, pointer walk D6, carry ripple D7, field
 * bands D8, pixel screen D9, a `timeline` scrubber and the program `builder`.
 *
 * The player owns the live machine. This stage follows `live.steps` (so Back, Reset and edits can never leave the
 * diagram disagreeing with the player) and sends every change back through `onEditStarter` / `onReplaceCards`.
 * Controls are the player's own. A locked control stays in place, says "Not yet" and does nothing.
 */
export function RealStage({ lesson, live, scene, onEditStarter, onReplaceCards, controls }: StageProps) {
  const timeline = useMachineTimeline(live.cards, { hideEnd: live.hideEnd, boxes: lesson.boxes, pointer: lesson.pointer });
  useFollow(timeline, live.steps, live.cards.join(","));

  const show = new Set(scene.show);
  const widgets = WIDGETS.filter((w) => show.has(w));
  const machine = show.has("D1") || widgets.length === 0;
  const editLocked = controls.isLocked("edit");
  const toggleLocked = controls.isLocked("toggle");
  const dragLocked = controls.isLocked("drag");
  const edit = (card: number, word: number) => onEditStarter(card, word, "edit");

  const parts: ReactNode[] = [];
  if (machine) {
    parts.push(
      <MachineView
        key="D1"
        timeline={timeline}
        coachIds
        renderCard={(word, i, state) => <Face word={word} index={i} count={live.cards.length} current={state.current} locked={editLocked} onEdit={edit} />}
      />,
    );
  }
  if (show.has("D3")) parts.push(wrap("D3", <HeartbeatView timeline={timeline} />));
  if (show.has("D6")) parts.push(wrap("D6", <PointerWalk timeline={timeline} coachIds={!machine} />));
  if (show.has("D9")) parts.push(wrap("D9", <div data-coach-id="tab:screen"><PixelDisplay timeline={timeline} /></div>));
  if (show.has("D4")) parts.push(<LampsPanel key="D4" spec={scene.lamps ?? { card: 0 }} cards={live.cards} readOnly={toggleLocked} onEdit={onEditStarter} />);
  if (show.has("D5")) parts.push(<FlipPanel key="D5" spec={scene.flip ?? { card: 0 }} cards={live.cards} />);
  if (show.has("D8")) parts.push(<BandsPanel key="D8" spec={scene.bands ?? { card: 0 }} cards={live.cards} readOnly={toggleLocked} onEdit={onEditStarter} />);
  if (show.has("D7") && scene.carry) parts.push(<CarryPanel key="D7" a={scene.carry.a} b={scene.carry.b} />);
  if (show.has("builder") && scene.tray) {
    parts.push(<BuilderPanel key="builder" cards={live.cards} tray={scene.tray} hideEnd={live.hideEnd} readOnly={dragLocked || live.demo} onReplace={onReplaceCards} />);
  }

  return (
    <div
      className="space-y-4"
      data-stage-scene={scene.id}
      data-live-steps={live.steps}
      data-live-boxes={live.boxes.map((b) => `${b.name}=${b.value}`).join(",")}
      data-live-words={live.cards.map(hex).join(",")}
      data-live-pc={live.pointer ?? live.cards.length}
      data-timeline-position={timeline.position}
      data-timeline-length={timeline.length}
    >
      <PlayerControls live={live} controls={controls} timeline={show.has("timeline")} length={timeline.length} />
      {parts}
    </div>
  );
}

/** A diagram that is not the machine view: its own labelled region, so a lesson can point at `diagram:D<n>`. */
function wrap(n: string, child: ReactNode): ReactNode {
  return (
    <div key={n} data-coach-id={`diagram:${n}`}>
      {child}
    </div>
  );
}

export const realStage: Stage = (props: StageProps) => <RealStage {...props} />;
