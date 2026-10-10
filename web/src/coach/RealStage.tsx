import { describe } from "@sierrendipity/explorer";
import type { ReactNode } from "react";
import { CardFace } from "../cards/CardFace";
import { cardToWord, wordToCard, type Card, type CustomCard } from "../cards/model";
import { GlassStrip, RulePanel, wordHex as hex } from "../machine";
import { HeartbeatView, MachineView, PixelDisplay, PointerWalk, useMachineTimeline } from "../diagrams";
import { PlayerControls } from "./PlayerControls";
import { plainBoxes } from "./plain";
import { BandsPanel, BuilderPanel, CarryPanel, FlipPanel, LampsPanel } from "./StageWidgets";
import type { Stage, StageProps } from "./types";

/** The scene `show` ids that draw their own widget. The machine view (D1) is on unless a scene shows only these. */
const WIDGETS = ["D3", "D4", "D5", "D6", "D7", "D8", "D9", "builder"];


/** One card of the list: a real face with a number spinner, or a plain face for a word that is not a Course 1 card. */
function Face({ word, program, index, count, current, locked, plain, glass, glassNamed, registerNames, onEdit }: { word: number; program?: { card: Card; customCards: CustomCard[] }; index: number; count: number; current: boolean; locked: boolean; plain: boolean; glass: boolean; glassNamed: boolean; registerNames: boolean; onEdit: (card: number, word: number) => void }) {
  const strip = glass ? <GlassStrip word={word} index={index} named={glassNamed} registerNames={registerNames} /> : null;
  const highlight = current ? "border-foreground ring-2 ring-foreground" : "";
  if (program) {
    return (
      <>
        <CardFace card={program.card} customCards={program.customCards} position={{ index, count }} className={highlight} />
        {strip}
      </>
    );
  }
  const card = wordToCard(word);
  if (!card) {
    const text = plain ? plainBoxes(describe(word, { vocabulary: "boxes" }).text) : describe(word, { vocabulary: "boxes" }).text;
    return (
      <>
        <div role="group" tabIndex={0} aria-label={text} className={`min-w-0 rounded-md border bg-editor px-3 py-2 text-sm text-editor-foreground [overflow-wrap:anywhere] ${highlight}`}>
          {text}
        </div>
        {strip}
      </>
    );
  }
  return (
    <>
      <CardFace
        card={card}
        position={{ index, count }}
        numberLabel={`Number on card ${index + 1}`}
        locked={locked}
        plainBoxes={plain}
        spinnerButtons
        className={highlight}
        onChange={(next) => onEdit(index, cardToWord(next))}
      />
      {strip}
    </>
  );
}

/**
 * The real stage: the clerk and boxes (D1) with number spinners on real card faces, and the other diagrams a
 * scene asks for (`show`): heartbeat D3, bit lamps D4, card flip D5, pointer walk D6, carry ripple D7, field
 * bands D8, pixel screen D9, a `timeline` scrubber and the program `builder`.
 *
 * The player owns the live machine. This stage draws the player's own session (so Back, Reset and edits can never leave the
 * diagram disagreeing with the player) and sends every change back through `onEditStarter` / `onReplaceCards`.
 * Controls are the player's own. A locked control stays in place, says "Not yet" and does nothing.
 */
export function RealStage({ lesson, live, scene, onEditStarter, onReplaceCards, onReplaceProgram, onSetFunctionInput, controls }: StageProps) {
  const timeline = useMachineTimeline(live.cards, { session: live.session, boxes: lesson.boxes, pointer: lesson.pointer });

  const sceneIndex = lesson.scenes.findIndex((s) => s.id === scene.id);
  const glassNamed = lesson.scenes.some((s, i) => s.glassNamed && i <= sceneIndex);
  const show = new Set(scene.show);
  const widgets = WIDGETS.filter((w) => show.has(w));
  const machine = show.has("D1") || widgets.length === 0;
  const editLocked = controls.isLocked("edit");
  const toggleLocked = controls.isLocked("toggle");
  const dragLocked = controls.isLocked("drag");
  const edit = (card: number, word: number) => onEditStarter(card, word, "edit");

  const parts: ReactNode[] = [];
  if (lesson.function && live.functionInput !== undefined) {
    parts.push(<RulePanel key="rule" fn={lesson.function} timeline={timeline} input={live.functionInput} onInput={onSetFunctionInput} locked={editLocked || live.demo || live.functionInputLocked === true} hideValues={scene.asking === true} />);
  }
  if (machine) {
    parts.push(
      <MachineView
        key="D1"
        timeline={timeline}
        coachIds
        stacked
        quiet={{ log: lesson.ui?.log, deskTitle: lesson.ui?.deskTitle, endMarker: lesson.ui?.endMarker, boxNames: lesson.ui?.boxNames }}
        renderCard={(word, i, state) => <Face word={word} {...(live.program?.cards[i]?.kind === "custom" ? { program: { card: live.program.cards[i]!, customCards: live.program.customCards } } : {})} index={i} count={live.cards.length} current={state.current} locked={editLocked} plain={lesson.ui?.boxNames === false} glass={lesson.ui?.glass === true} glassNamed={glassNamed} registerNames={lesson.ui?.boxNames !== false} onEdit={edit} />}
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
    parts.push(<BuilderPanel key="builder" cards={live.cards} tray={scene.tray} hideEnd={live.hideEnd} readOnly={dragLocked || live.demo} onReplace={onReplaceCards} onReplaceProgram={onReplaceProgram} {...(live.program ? { program: live.program } : {})} {...(scene.save ? { save: scene.save } : {})} />);
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
      <PlayerControls live={live} controls={controls} timeline={show.has("timeline")} length={timeline.length} ui={lesson.ui} />
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
