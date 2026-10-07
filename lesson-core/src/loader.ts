import { assemble, decode, parseMachineCode } from "@sierrendipity/explorer";
import { parse as parseYaml } from "yaml";
import { parseFeature, GherkinError, type Feature } from "./gherkin/parse";
import { TARGET_PATTERN, validateGhost, type Ghost } from "./ghost";
import {
  ASK_KINDS,
  LENSES,
  type FlipSpec,
  type LampSpec,
  EARLY_MAX_CARDS,
  EARLY_MAX_MINUTES,
  LOCKS,
  MAX_HINT_CHARS,
  MAX_NOW_YOU_CAN_CHARS,
  MAX_QUESTION_CHARS,
  MAX_SENTENCES_PER_SCENE,
  MAX_STEPS_CAP,
  MAX_WORDS_PER_SCENE,
  SHOWABLE,
  TABS,
  knownTarget,
  publishLesson,
  type Ask,
  type Lesson,
  type LessonUi,
  type OnWrong,
  type Program,
  type Scene,
  type SideRoom,
  type SolutionDecl,
  type Warmup,
} from "./lesson";
import { registerNumber, STOP_WORD } from "./steps/run";
import { featureProblems } from "./steps/checks";
import { lessonSteProblems } from "./ste";
import { parseStep } from "./steps/table";

export { publishLesson };

export type LoadResult = { ok: true; lesson: Lesson } | { ok: false; errors: string[] };
export interface LoadOptions {
  /** The lesson's directory relative to lessons/ (for example "c1/01-press-the-button"); the id must match it. */
  dir?: string;
  /** When given, every concept named by the lesson must be in this set. */
  knownConcepts?: Iterable<string>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Count sentences by their ending punctuation (an unpunctuated tail counts as one). */
export function countSentences(text: string): number {
  return text.split(/[.!?]+(?=\s+[A-Z0-9"'(]|\s*$)/).filter((s) => s.trim() !== "").length;
}
export const countWords = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function programOf(raw: unknown, where: string, errors: string[]): Program | undefined {
  if (!isObj(raw) || ("asm" in raw === "hex" in raw)) {
    errors.push(`${where}: must have exactly one of asm (assembly text) or hex (words)`);
    return undefined;
  }
  if ("asm" in raw) {
    if (typeof raw.asm !== "string") return void errors.push(`${where}: asm must be text`);
    const r = assemble(raw.asm);
    if (r.errors.length) {
      for (const e of r.errors) errors.push(`${where}: line ${e.line}: ${e.message}`);
      return undefined;
    }
    return { kind: "asm", text: raw.asm, words: r.words };
  }
  const text = Array.isArray(raw.hex) ? raw.hex.map(String).join("\n") : typeof raw.hex === "string" ? raw.hex : undefined;
  if (text === undefined) return void errors.push(`${where}: hex must be a word or a list of words`);
  const r = parseMachineCode(text);
  if (r.errors.length) {
    for (const e of r.errors) errors.push(`${where}: ${e.message}`);
    return undefined;
  }
  return { kind: "hex", text, words: r.words };
}

const UI_BOOLEANS = ["log", "deskTitle", "endMarker", "boxNames", "glass", "spotlightAfterHint"] as const;

/** The optional `ui` block: which parts of the machine the lesson shows. */
function parseUi(input: unknown, errors: string[]): LessonUi | undefined {
  if (input === undefined) return undefined;
  const raw = input as Obj;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    errors.push("lesson.yaml: ui must be a mapping");
    return undefined;
  }
  unknownKeys(raw, ["controls", "stepLabel", "resetLabel", "log", "deskTitle", "endMarker", "boxNames", "glass", "spotlight", "spotlightAfterHint"], "lesson.yaml ui", errors);
  const ui: LessonUi = {};
  if (raw.controls !== undefined) {
    const ok = Array.isArray(raw.controls) && raw.controls.length > 0 && raw.controls.every((c) => c === "step" || c === "back" || c === "reset");
    if (!ok || new Set(raw.controls as string[]).size !== (raw.controls as string[]).length) errors.push("lesson.yaml ui: controls must be a list of step, back and reset");
    else if (!(raw.controls as string[]).includes("step")) errors.push("lesson.yaml ui: controls must include step (the Step button is always shown)");
    else ui.controls = raw.controls as LessonUi["controls"];
  }
  if (raw.stepLabel !== undefined) {
    if (typeof raw.stepLabel !== "string" || raw.stepLabel.trim() === "" || raw.stepLabel.length > 20) errors.push("lesson.yaml ui: stepLabel must be a short word");
    else ui.stepLabel = raw.stepLabel.trim();
  }
  if (raw.resetLabel !== undefined) {
    if (typeof raw.resetLabel !== "string" || raw.resetLabel.trim() === "" || raw.resetLabel.length > 20) errors.push("lesson.yaml ui: resetLabel must be a short phrase");
    else ui.resetLabel = raw.resetLabel.trim();
  }
  for (const key of UI_BOOLEANS) {
    if (raw[key] === undefined) continue;
    if (typeof raw[key] !== "boolean") errors.push(`lesson.yaml ui: ${key} must be true or false`);
    else ui[key] = raw[key] as boolean;
  }
  if (raw.spotlight !== undefined) {
    if (raw.spotlight !== "ring" && raw.spotlight !== "dim") errors.push("lesson.yaml ui: spotlight must be ring or dim");
    else ui.spotlight = raw.spotlight;
  }
  return Object.keys(ui).length > 0 ? ui : undefined;
}

function unknownKeys(obj: Obj, allowed: string[], where: string, errors: string[]): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(`${where}: unknown key "${k}"`);
}

interface SceneCtx {
  boxes: string[];
  tabs: string[];
  cards: number;
}

/** Which student control a step phrase needs the scene to leave unlocked. */
function controlNeeded(phrase: string): { control: string; label: string } | undefined {
  if (/^(?:the )?student edited/i.test(phrase)) return { control: "edit", label: "an edit" };
  if (/^(?:the )?student toggled/i.test(phrase)) return { control: "toggle", label: "a toggle" };
  if (/^(?:the )?student rewound/i.test(phrase)) return { control: "back", label: "a rewind" };
  if (/^(?:the )?student/i.test(phrase) || /^the timeline/i.test(phrase)) return undefined;
  return { control: "step", label: "steps" };
}

const boxesIn = (phrase: string): string[] => [...phrase.matchAll(/\bbox (?!zero\b)([a-z]\w*)/gi)].map((m) => m[1]!).filter((b) => registerNumber(b) !== undefined);

const isWholeIn = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** `lamps` (D4) or `bands` (D8): a card, and optionally which lamps may be switched. */
function parseLampSpec(raw: unknown, key: "lamps" | "bands", w: string, ctx: SceneCtx, errors: string[]): LampSpec | undefined {
  const where = `${w}: ${key}`;
  if (!isObj(raw)) return void errors.push(`${where} must be a mapping like { card: 0 }`);
  unknownKeys(raw, key === "lamps" ? ["card", "of", "width", "allowedBits", "lockedBits", "target", "hide"] : ["card", "allowedBits", "lockedBits"], where, errors);
  const n = errors.length;
  if (!isWholeIn(raw.card, 0, 1_000_000) || raw.card >= Math.max(ctx.cards, 1)) errors.push(`${where} card ${String(raw.card)} is not a card of this lesson (0 to ${Math.max(ctx.cards, 1) - 1})`);
  const spec: LampSpec = { card: raw.card as number };
  for (const bits of ["allowedBits", "lockedBits"] as const) {
    const v = raw[bits];
    if (v === undefined) continue;
    if (!Array.isArray(v) || !v.every((b) => isWholeIn(b, 0, 31))) errors.push(`${where} ${bits}: bits must be whole numbers from 0 to 31`);
    else spec[bits] = v as number[];
  }
  if (key === "lamps") {
    if (raw.of !== undefined && raw.of !== "word" && raw.of !== "number") errors.push(`${where} of must be word or number`);
    else if (raw.of !== undefined) spec.of = raw.of;
    if (raw.width !== undefined) {
      if (raw.of !== "number") errors.push(`${where} width only applies with of: number`);
      else if (!isWholeIn(raw.width, 1, 11)) errors.push(`${where} width must be a whole number from 1 to 11`);
      else spec.width = raw.width;
    }
    if (raw.hide !== undefined) {
      if (!Array.isArray(raw.hide) || !raw.hide.every((h) => h === "worth" || h === "total")) errors.push(`${where} hide must be a list of worth and total`);
      else spec.hide = raw.hide as ("worth" | "total")[];
    }
    if (raw.target !== undefined) {
      if (!isWholeIn(raw.target, 0, 0xffffffff)) errors.push(`${where} target must be a whole number`);
      else spec.target = raw.target;
    }
  }
  return errors.length > n ? undefined : spec;
}

function parseFlip(raw: unknown, w: string, ctx: SceneCtx, errors: string[]): FlipSpec | undefined {
  if (!isObj(raw)) return void errors.push(`${w}: flip must be a mapping like { card: 0 }`);
  unknownKeys(raw, ["card", "lenses"], `${w}: flip`, errors);
  const n = errors.length;
  if (!isWholeIn(raw.card, 0, 1_000_000) || raw.card >= Math.max(ctx.cards, 1)) errors.push(`${w}: flip card ${String(raw.card)} is not a card of this lesson (0 to ${Math.max(ctx.cards, 1) - 1})`);
  let lenses: string[] | undefined;
  if (raw.lenses !== undefined) {
    if (!isStrList(raw.lenses) || raw.lenses.length === 0) errors.push(`${w}: flip lenses must be a list of ${LENSES.join(", ")}`);
    else {
      for (const l of raw.lenses) if (!(LENSES as readonly string[]).includes(l)) errors.push(`${w}: flip has unknown lens "${l}" (use ${LENSES.join(", ")})`);
      lenses = raw.lenses;
    }
  }
  return errors.length > n ? undefined : { card: raw.card as number, ...(lenses ? { lenses } : {}) };
}

function parseTray(raw: unknown, w: string, errors: string[]): number[] | undefined {
  if (!isStrList(raw) || raw.length === 0) return void errors.push(`${w}: tray must list at least one card, each as a line of assembly`);
  const words: number[] = [];
  raw.forEach((line, k) => {
    const r = assemble(line);
    if (r.errors.length !== 0 || r.words.length !== 1) errors.push(`${w}: tray[${k}] must be one instruction that assembles${r.errors[0] ? ` (${r.errors[0].message})` : ""}`);
    else words.push(r.words[0]!);
  });
  return words.length === raw.length ? words : undefined;
}

function parseScene(raw: unknown, i: number, ctx: SceneCtx, errors: string[]): Scene | undefined {
  if (!isObj(raw)) return void errors.push(`scenes[${i}] must be a mapping`);
  const id = raw.id;
  if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) return void errors.push(`scenes[${i}]: id must be a lowercase slug`);
  const w = `scene "${id}"`;
  const n = errors.length;
  unknownKeys(raw, ["id", "say", "doneSay", "ifMissed", "show", "spotlight", "ask", "until", "onWrong", "hints", "showMe", "lock", "skippable", "lamps", "bands", "flip", "carry", "tray"], w, errors);

  const say = raw.say;
  if (!isStr(say)) errors.push(`${w}: say must be non-empty text`);
  else {
    if (countSentences(say) > MAX_SENTENCES_PER_SCENE) errors.push(`${w}: say has ${countSentences(say)} sentences (at most ${MAX_SENTENCES_PER_SCENE} sentences)`);
    if (countWords(say) > MAX_WORDS_PER_SCENE) errors.push(`${w}: say has ${countWords(say)} words (at most ${MAX_WORDS_PER_SCENE} words)`);
  }
  let doneSay: string | undefined;
  if (raw.doneSay !== undefined) {
    if (!isStr(raw.doneSay)) errors.push(`${w}: doneSay must be non-empty text`);
    else {
      doneSay = raw.doneSay;
      if (countSentences(doneSay) > MAX_SENTENCES_PER_SCENE) errors.push(`${w}: doneSay has ${countSentences(doneSay)} sentences (at most ${MAX_SENTENCES_PER_SCENE} sentences)`);
      if (countWords(doneSay) > MAX_WORDS_PER_SCENE) errors.push(`${w}: doneSay has ${countWords(doneSay)} words (at most ${MAX_WORDS_PER_SCENE} words)`);
    }
  }
  let ifMissed: string | undefined;
  if (raw.ifMissed !== undefined) {
    if (!isStr(raw.ifMissed)) errors.push(`${w}: ifMissed must be non-empty text`);
    else {
      ifMissed = raw.ifMissed;
      if (countSentences(ifMissed) > MAX_SENTENCES_PER_SCENE + 1) errors.push(`${w}: ifMissed has ${countSentences(ifMissed)} sentences (at most ${MAX_SENTENCES_PER_SCENE + 1} sentences)`);
      if (countWords(ifMissed) > MAX_WORDS_PER_SCENE + 15) errors.push(`${w}: ifMissed has ${countWords(ifMissed)} words (at most ${MAX_WORDS_PER_SCENE + 15} words)`);
      if (!Array.isArray(raw.until) || raw.until.length === 0) errors.push(`${w}: ifMissed needs an until goal to miss`);
      if (raw.ask !== undefined) errors.push(`${w}: ifMissed cannot be used with ask (a question has no run to miss)`);
    }
  }
  const show = raw.show === undefined ? [] : raw.show;
  if (!isStrList(show)) errors.push(`${w}: show must be a list of names`);
  else
    for (const s of show) {
      if (!SHOWABLE.includes(s)) errors.push(`${w}: unknown thing to show "${s}" (use ${SHOWABLE.join(", ")})`);
      else if ((TABS as readonly string[]).includes(s) && s !== "boxes" && !ctx.tabs.includes(s)) errors.push(`${w}: shows "${s}" but tabs does not include it`);
    }
  if (raw.spotlight !== undefined && !(typeof raw.spotlight === "string" && TARGET_PATTERN.test(raw.spotlight) && knownTarget(raw.spotlight, ctx))) {
    errors.push(`${w}: spotlight ${JSON.stringify(raw.spotlight)} is not a known UI target (button:step, card:<n> of this lesson, glass:<n> with ui.glass, box:<one of boxes>, tab:<one of tabs>, diagram:D1, band:<field>, lamp:<0-31>, flip, tray)`);
  }
  const shows = isStrList(show) ? show : [];
  const needs = (field: string, id: string): boolean => {
    if (raw[field] === undefined) return false;
    if (!shows.includes(id)) errors.push(`${w}: ${field} needs ${id} in show`);
    return shows.includes(id);
  };
  const lamps = needs("lamps", "D4") ? parseLampSpec(raw.lamps, "lamps", w, ctx, errors) : undefined;
  const bands = needs("bands", "D8") ? parseLampSpec(raw.bands, "bands", w, ctx, errors) : undefined;
  const flip = needs("flip", "D5") ? parseFlip(raw.flip, w, ctx, errors) : undefined;
  let carry: { a: number; b: number } | undefined;
  if (needs("carry", "D7")) {
    const c = raw.carry;
    if (!isObj(c) || !isWholeIn(c.a, 0, 0xffffffff) || !isWholeIn(c.b, 0, 0xffffffff)) errors.push(`${w}: carry a and b must be whole numbers like { a: 5, b: 7 }`);
    else {
      unknownKeys(c, ["a", "b"], `${w}: carry`, errors);
      carry = { a: c.a, b: c.b };
    }
  }
  const tray = needs("tray", "builder") ? parseTray(raw.tray, w, errors) : undefined;
  let ask: Ask | undefined;
  if (raw.ask !== undefined) {
    ask = parseAsk(raw.ask, w, errors);
    if (ask && "target" in ask && ask.target && ask.kind === "number" && !ctx.boxes.includes(ask.target)) errors.push(`${w}: ask uses box ${ask.target} but boxes lists only ${ctx.boxes.join(", ")}`);
    if (ask && ask.question.length > MAX_QUESTION_CHARS) errors.push(`${w}: ask question is too long (at most ${MAX_QUESTION_CHARS} characters)`);
  }

  const until = raw.until === undefined ? [] : raw.until;
  if (!isStrList(until)) errors.push(`${w}: until must be a list of step phrases`);
  else
    until.forEach((phrase, k) => {
      const p = parseStep(phrase);
      if (!p.ok) errors.push(`${w}: until[${k}]: ${p.error}`);
      if (/^(?:given |when |then |and |but )?the machine has taken (?!at least)\S+ steps?$/i.test(phrase.trim())) {
        errors.push(`${w}: until[${k}]: exact step counts are overshot by one extra press; say "the machine has taken at least N steps"`);
      }
      for (const b of boxesIn(phrase)) if (!ctx.boxes.includes(b)) errors.push(`${w}: until[${k}] uses box ${b} but boxes lists only ${ctx.boxes.join(", ")}`);
      if (/\bthe box\b/i.test(phrase) && !ctx.boxes.includes("a0")) errors.push(`${w}: until[${k}] uses box a0 (the box) but boxes lists only ${ctx.boxes.join(", ")}`);
    });

  const hints = raw.hints;
  const needsHints = (Array.isArray(until) && until.length > 0) || ask !== undefined;
  if (hints === undefined ? needsHints : !(Array.isArray(hints) && hints.length === 3 && hints.every(isStr))) {
    errors.push(`${w}: needs exactly 3 hints, each a non-empty line (nudge, narrower question, near-answer)`);
  }
  const lock = raw.lock === undefined ? [] : raw.lock;
  if (!isStrList(lock)) errors.push(`${w}: lock must be a list`);
  else {
    for (const l of lock) if (!(LOCKS as readonly string[]).includes(l)) errors.push(`${w}: unknown lock "${l}" (use ${LOCKS.join(", ")})`);
    if (Array.isArray(until) && isStrList(until)) {
      for (const phrase of until) {
        const need = controlNeeded(phrase.replace(/^(?:given|when|then|and|but)\s+/i, ""));
        if (need && lock.includes(need.control)) errors.push(`${w}: locks ${need.control[0]!.toUpperCase()}${need.control.slice(1)} but waits for ${need.label} ("${phrase}")`);
      }
    }
  }
  if (Array.isArray(hints)) for (const h of hints) if (typeof h === "string" && h.length > MAX_HINT_CHARS) errors.push(`${w}: a hint is too long (at most ${MAX_HINT_CHARS} characters)`);
  if (raw.skippable !== undefined && typeof raw.skippable !== "boolean") errors.push(`${w}: skippable must be true or false`);
  if (raw.showMe !== undefined && !isStr(raw.showMe)) errors.push(`${w}: showMe must be a ghost id`);

  const onWrong: OnWrong[] = [];
  if (raw.onWrong !== undefined) {
    if (!Array.isArray(raw.onWrong)) errors.push(`${w}: onWrong must be a list`);
    else if (!ask) errors.push(`${w}: onWrong needs an ask to react to`);
    else {
      const seen = new Set<string>();
      raw.onWrong.forEach((o, k) => {
        if (isObj(o) && (typeof o.match === "number" || typeof o.match === "string")) {
          const key = String(o.match);
          if (seen.has(key)) errors.push(`${w}: duplicate onWrong match ${key}`);
          seen.add(key);
          if (ask!.kind === "number") {
            if (typeof o.match !== "number") errors.push(`${w}: onWrong[${k}]: a number ask needs a number match, not ${JSON.stringify(o.match)}`);
            else if (o.match === ask!.answer) errors.push(`${w}: onWrong[${k}]: match ${o.match} is the correct answer`);
          } else if (ask!.kind === "choice") {
            const right = ask!.choices[ask!.answer];
            if (o.match === right || o.match === ask!.answer) errors.push(`${w}: onWrong[${k}]: match ${JSON.stringify(o.match)} is the correct answer`);
          }
        }
        if (!isObj(o) || !(typeof o.match === "number" || isStr(o.match)) || !isStr(o.say)) return void errors.push(`${w}: onWrong[${k}] needs match (a number or text) and say`);
        unknownKeys(o, ["match", "say", "goto"], `${w}: onWrong[${k}]`, errors);
        if (countWords(o.say) > MAX_WORDS_PER_SCENE || countSentences(o.say) > MAX_SENTENCES_PER_SCENE) errors.push(`${w}: onWrong[${k}].say is too long (at most ${MAX_SENTENCES_PER_SCENE} sentences, ${MAX_WORDS_PER_SCENE} words)`);
        if (o.goto !== undefined && !isStr(o.goto)) errors.push(`${w}: onWrong[${k}].goto must be a scene id`);
        onWrong.push({ match: o.match as number | string, say: o.say, ...(o.goto ? { goto: String(o.goto) } : {}) });
      });
    }
  }
  if (errors.length > n) return undefined;
  return {
    id,
    say: say as string,
    ...(doneSay ? { doneSay } : {}),
    ...(ifMissed ? { ifMissed } : {}),
    show: show as string[],
    ...(raw.spotlight ? { spotlight: raw.spotlight as string } : {}),
    ...(ask ? { ask } : {}),
    until: until as string[],
    onWrong,
    hints: (hints as string[] | undefined) ?? [],
    ...(raw.showMe ? { showMe: raw.showMe as string } : {}),
    lock: lock as string[],
    skippable: raw.skippable === true,
    ...(lamps ? { lamps } : {}),
    ...(bands ? { bands } : {}),
    ...(flip ? { flip } : {}),
    ...(carry ? { carry } : {}),
    ...(tray ? { tray } : {}),
  };
}

function parseAsk(raw: unknown, w: string, errors: string[]): Ask | undefined {
  if (!isObj(raw)) return void errors.push(`${w}: ask must be a mapping`);
  if (!(ASK_KINDS as readonly string[]).includes(raw.kind as string)) return void errors.push(`${w}: ask kind ${JSON.stringify(raw.kind)} is not one of ${ASK_KINDS.join(", ")}`);
  if (!isStr(raw.question)) return void errors.push(`${w}: ask needs a question`);
  const question = raw.question;
  switch (raw.kind) {
    case "number": {
      unknownKeys(raw, ["kind", "question", "answer", "target"], `${w}: ask`, errors);
      if (typeof raw.answer !== "number") return void errors.push(`${w}: ask answer must be a number`);
      if (raw.target !== undefined && !(typeof raw.target === "string" && registerNumber(raw.target) !== undefined)) return void errors.push(`${w}: ask target: no box called '${String(raw.target)}'`);
      return { kind: "number", question, answer: raw.answer, ...(raw.target ? { target: raw.target as string } : {}) };
    }
    case "choice": {
      unknownKeys(raw, ["kind", "question", "answer", "choices"], `${w}: ask`, errors);
      if (!isStrList(raw.choices) || raw.choices.length < 2) return void errors.push(`${w}: ask choices must be a list of at least 2 options`);
      if (!Number.isInteger(raw.answer) || (raw.answer as number) < 0 || (raw.answer as number) >= raw.choices.length) return void errors.push(`${w}: ask answer must be the index of a choice`);
      return { kind: "choice", question, choices: raw.choices, answer: raw.answer as number };
    }
    case "click-target": {
      unknownKeys(raw, ["kind", "question", "target"], `${w}: ask`, errors);
      if (!(typeof raw.target === "string" && TARGET_PATTERN.test(raw.target))) return void errors.push(`${w}: ask target must look like "box:a2"`);
      return { kind: "click-target", question, target: raw.target };
    }
    default: {
      unknownKeys(raw, ["kind", "question", "query"], `${w}: ask`, errors);
      if (!isStr(raw.query)) return void errors.push(`${w}: ask query must be a step phrase`);
      const p = parseStep(raw.query);
      if (!p.ok) return void errors.push(`${w}: ask query: ${p.error}`);
      return { kind: "machine-query", question, query: raw.query };
    }
  }
}

function yaml(files: Record<string, string>, name: string, errors: string[]): unknown {
  const text = files[name];
  if (text === undefined) {
    errors.push(`missing ${name}`);
    return undefined;
  }
  try {
    return parseYaml(text);
  } catch (e) {
    errors.push(`${name}: ${(e as Error).message.split("\n")[0]}`);
    return undefined;
  }
}

/** Validate and load a lesson from an in-memory map of relative file names to text. Reports every problem found. */
export function loadLesson(files: Record<string, string>, opts: LoadOptions = {}): LoadResult {
  const errors: string[] = [];
  const known = opts.knownConcepts ? new Set(opts.knownConcepts) : undefined;
  const raw = yaml(files, "lesson.yaml", errors);

  let feature: Feature | undefined;
  if (files["checks.feature"] === undefined) errors.push("missing checks.feature");
  else {
    try {
      feature = parseFeature(files["checks.feature"]);
      if (!feature.scenarios.some((s) => s.tags.includes("pass"))) errors.push("checks.feature has no @pass scenario");
      for (const p of featureProblems(feature)) errors.push(`checks.feature: ${p}`);
    } catch (e) {
      if (!(e instanceof GherkinError)) throw e;
      errors.push(`checks.feature: ${e.message}`);
    }
  }

  // ghosts
  const ghosts: Record<string, Ghost> = {};
  for (const name of Object.keys(files).filter((f) => /^ghosts\/[^/]+$/.test(f)).sort()) {
    const stem = name.slice(7).replace(/\.json$/, "");
    if (!name.endsWith(".json")) {
      errors.push(`${name}: ghost scripts must be .json`);
      continue;
    }
    let value: unknown;
    try {
      value = JSON.parse(files[name]!);
    } catch (e) {
      errors.push(`ghost "${stem}" (${name}): ${(e as Error).message}`);
      continue;
    }
    const r = validateGhost(value, stem);
    if ("errors" in r) for (const e of r.errors) errors.push(`ghost "${stem}" (${name}): ${e}`);
    else ghosts[stem] = r.ghost;
  }

  let lesson: Omit<Lesson, "solutions" | "checks"> | undefined;
  if (raw !== undefined) {
    lesson = parseLessonYaml(raw, ghosts, known, opts.dir, errors);
  }

  const stars = new Set(feature?.scenarios.flatMap((s) => (s.tags.includes("pass") ? ["pass"] : s.tags.filter((t) => t.startsWith("star=")).map((t) => t.slice(5)))) ?? []);
  const solutions = parseSolutions(files, stars, lesson?.hideEnd === true, errors);
  if (lesson) lessonLimits(lesson, solutions, errors);
  if (lesson) errors.push(...lessonSteProblems(lesson as Lesson));
  if (lesson) {
    const ids = new Set(lesson.scenes.map((s) => s.id));
    for (const sol of solutions) for (const id of sol.scenes ?? []) if (!ids.has(id)) errors.push(`solutions/${sol.file}: scenes names unknown scene "${id}"`);
  }

  if (errors.length || !lesson || !feature) return { ok: false, errors };
  return { ok: true, lesson: { ...lesson, checks: feature, solutions } };
}

function parseLessonYaml(raw: unknown, ghosts: Record<string, Ghost>, known: Set<string> | undefined, dir: string | undefined, errors: string[]): Omit<Lesson, "solutions" | "checks"> | undefined {
  const n = errors.length;
  if (!isObj(raw)) return void errors.push("lesson.yaml: must be a mapping");
  unknownKeys(raw, ["id", "title", "minutes", "concepts", "boxes", "pointer", "hideEnd", "ui", "earlyLesson", "draft", "onWrongDefault", "starter", "tabs", "scenes", "nowYouCan", "warmups", "sideRooms"], "lesson.yaml", errors);

  if (!isStr(raw.id) || !/^[a-z0-9]+\/[a-z0-9-]+$/.test(raw.id)) errors.push('lesson.yaml: id must look like "c1/01-press-the-button"');
  else if (dir !== undefined && raw.id !== dir) errors.push(`lesson.yaml: id "${raw.id}" does not match the directory "${dir}"`);
  if (!isStr(raw.title)) errors.push("lesson.yaml: title must be a non-empty string");
  if (!(Number.isInteger(raw.minutes) && (raw.minutes as number) >= 1 && (raw.minutes as number) <= 60)) errors.push("lesson.yaml: minutes must be a whole number from 1 to 60");

  const concepts = { introduces: [] as string[], requires: [] as string[] };
  if (!isObj(raw.concepts)) errors.push("lesson.yaml: concepts must have introduces and requires lists");
  else {
    unknownKeys(raw.concepts, ["introduces", "requires"], "lesson.yaml: concepts", errors);
    for (const key of ["introduces", "requires"] as const) {
      const list = raw.concepts[key] ?? [];
      if (!isStrList(list)) errors.push(`lesson.yaml: concepts.${key} must be a list`);
      else
        for (const c of list) {
          concepts[key].push(c);
          if (known && !known.has(c)) errors.push(`lesson.yaml: unknown concept "${c}" in concepts.${key}`);
        }
    }
  }

  const boxes = raw.boxes;
  if (!(isStrList(boxes) && boxes.length > 0 && boxes.every((b) => registerNumber(b) !== undefined))) errors.push("lesson.yaml: boxes must be a non-empty list of box names (like a0, a1)");
  if (isStrList(boxes)) boxes.forEach((b, i) => { if (boxes.indexOf(b) !== i) errors.push(`lesson.yaml: duplicate box "${b}" in boxes`); });
  for (const key of ["pointer", "hideEnd", "earlyLesson", "draft"] as const) if (raw[key] !== undefined && typeof raw[key] !== "boolean") errors.push(`lesson.yaml: ${key} must be true or false`);
  const ui = parseUi(raw.ui, errors);
  const hideEnd = raw.hideEnd === true;
  const endProblem = (p: Program | undefined, where: string): void => {
    if (hideEnd && p && p.words.at(-1) === STOP_WORD) errors.push(`${where}: with hideEnd the end marker is added for you; remove the final Stop card (ebreak)`);
  };
  const boxList = isStrList(boxes) ? boxes : [];
  const boxProblem = (p: Program | undefined, where: string): void => {
    if (!p || boxList.length === 0) return;
    for (const r of registersIn(p.words)) if (!boxList.includes(r)) errors.push(`${where}: uses box ${r} but boxes lists only ${boxList.join(", ")}`);
  };
  const starter = programOf(raw.starter, "starter", errors);
  endProblem(starter, "starter");
  boxProblem(starter, "starter");
  const tabs = raw.tabs ?? [];
  if (!isStrList(tabs)) errors.push("lesson.yaml: tabs must be a list");
  else for (const t of tabs) if (!(TABS as readonly string[]).includes(t)) errors.push(`lesson.yaml: unknown tab "${t}" (use ${TABS.join(", ")})`);

  const scenes: Scene[] = [];
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) errors.push("lesson.yaml: scenes must be a non-empty list");
  else {
    const ids = new Set<string>();
    raw.scenes.forEach((s, i) => {
      const id = isObj(s) && typeof s.id === "string" ? s.id : undefined;
      if (id && ids.has(id)) errors.push(`lesson.yaml: duplicate scene id "${id}"`);
      if (id) ids.add(id);
      const scene = parseScene(s, i, { boxes: boxList, tabs: isStrList(tabs) ? tabs : [], cards: starter?.words.length ?? 0 }, errors);
      if (scene) scenes.push(scene);
    });
    for (const s of scenes) {
      if (s.spotlight?.startsWith("glass:") && ui?.glass !== true) errors.push(`scene "${s.id}": spotlight ${s.spotlight} needs ui.glass: true`);
      for (const control of ["back", "reset"] as const) {
        if (s.spotlight === `button:${control}` && ui?.controls && !ui.controls.includes(control)) errors.push(`scene "${s.id}": spotlight button:${control} points at a button that ui.controls hides`);
      }
      if (s.showMe !== undefined && !(s.showMe in ghosts)) errors.push(`scene "${s.id}": showMe: no ghost "${s.showMe}" in ghosts/`);
      s.onWrong.forEach((o, k) => {
        if (o.goto !== undefined && !ids.has(o.goto)) errors.push(`scene "${s.id}": onWrong[${k}].goto unknown scene "${o.goto}"`);
      });
      // A tray drag in a ghost needs the scene to have that tray card.
      const ghost = s.showMe !== undefined ? ghosts[s.showMe] : undefined;
      ghost?.events.forEach((e, k) => {
        if (e.type === "drag" && "tray" in e && e.tray >= (s.tray?.length ?? 0)) errors.push(`ghost "${s.showMe}": events[${k}] drags tray card ${e.tray} but scene "${s.id}" needs a tray with that card`);
      });
    }
  }

  const nowYouCan = raw.nowYouCan ?? [];
  if (!isStrList(nowYouCan)) errors.push("lesson.yaml: nowYouCan must be a list of short lines");
  else for (const line of nowYouCan) if (line.length > MAX_NOW_YOU_CAN_CHARS) errors.push(`lesson.yaml: nowYouCan line is too long (at most ${MAX_NOW_YOU_CAN_CHARS} characters): "${line}"`);

  let onWrongDefault: string | undefined;
  let onWrongDefaultGoto: string | undefined;
  if (raw.onWrongDefault !== undefined) {
    // Plain text, or { say, goto } to name the scene that reveals the answer.
    const od = raw.onWrongDefault;
    const say = isObj(od) ? od.say : od;
    if (isObj(od)) unknownKeys(od, ["say", "goto"], "lesson.yaml: onWrongDefault", errors);
    if (isObj(od) && od.goto !== undefined) {
      if (!isStr(od.goto)) errors.push("lesson.yaml: onWrongDefault goto must be a scene id");
      else if (!scenes.some((sc) => sc.id === od.goto)) errors.push(`lesson.yaml: onWrongDefault goto unknown scene "${od.goto}"`);
      else onWrongDefaultGoto = od.goto;
    }
    if (!isStr(say) || countSentences(say) > MAX_SENTENCES_PER_SCENE || countWords(say) > MAX_WORDS_PER_SCENE) errors.push(`lesson.yaml: onWrongDefault must be text of at most ${MAX_SENTENCES_PER_SCENE} sentences and ${MAX_WORDS_PER_SCENE} words`);
    else onWrongDefault = say;
  }
  if (scenes.some((sc) => sc.ask) && onWrongDefault === undefined && raw.onWrongDefault === undefined) errors.push("lesson.yaml: this lesson asks questions, so it needs an onWrongDefault reply for any other wrong answer");

  // Ghost pointing must name real UI targets.
  for (const [id, g] of Object.entries(ghosts)) {
    g.events.forEach((e, k) => {
      if (e.type === "point" && !knownTarget(e.target, { boxes: boxList, tabs: isStrList(tabs) ? tabs : [], cards: starter?.words.length ?? 0 })) errors.push(`ghost "${id}": events[${k}].target "${e.target}" is not a known UI target`);
    });
  }
  const warmups: Warmup[] = [];
  const wl = raw.warmups ?? [];
  if (!Array.isArray(wl)) errors.push("lesson.yaml: warmups must be a list");
  else
    wl.forEach((w, i) => {
      if (!isObj(w) || !isStr(w.id)) return void errors.push(`lesson.yaml: warmups[${i}] needs an id`);
      const where = `warmup "${w.id}"`;
      unknownKeys(w, ["id", "concept", "question", "program", "target", "expected", "startRegs"], where, errors);
      if (!isStr(w.concept) || !concepts.introduces.includes(w.concept)) errors.push(`${where}: concept "${String(w.concept)}" must be a concept this lesson introduces`);
      if (!isStr(w.question)) errors.push(`${where}: question must be non-empty text`);
      else if (w.question.length > MAX_QUESTION_CHARS) errors.push(`${where}: question is too long (at most ${MAX_QUESTION_CHARS} characters)`);
      if (typeof w.expected !== "number") errors.push(`${where}: expected must be a number`);
      if (!(typeof w.target === "string" && registerNumber(w.target) !== undefined)) errors.push(`${where}: target: no box called '${String(w.target)}'`);
      let startRegs: Record<string, number> | undefined;
      if (w.startRegs !== undefined) {
        if (isObj(w.startRegs) && Object.entries(w.startRegs).every(([k, v]) => registerNumber(k) !== undefined && typeof v === "number")) startRegs = w.startRegs as Record<string, number>;
        else errors.push(`${where}: startRegs must map box names to numbers`);
      }
      const program = programOf(w.program, `${where}: program`, errors);
      endProblem(program, `${where}: program`);
      boxProblem(program, `${where}: program`);
      if (typeof w.target === "string" && registerNumber(w.target) !== undefined && boxList.length && !boxList.includes(w.target)) errors.push(`${where}: target uses box ${w.target} but boxes lists only ${boxList.join(", ")}`);
      if (program && typeof w.expected === "number" && isStr(w.concept) && isStr(w.question) && typeof w.target === "string") {
        warmups.push({ id: w.id, concept: w.concept, question: w.question, program, target: w.target, expected: w.expected, ...(startRegs ? { startRegs } : {}) });
      }
    });

  const sideRooms: SideRoom[] = [];
  const sr = raw.sideRooms ?? [];
  if (!Array.isArray(sr)) errors.push("lesson.yaml: sideRooms must be a list");
  else
    sr.forEach((r, i) => {
      if (isObj(r) && isStr(r.id) && isStr(r.title) && isStr(r.opensWith)) sideRooms.push({ id: r.id, title: r.title, opensWith: r.opensWith });
      else errors.push(`lesson.yaml: sideRooms[${i}] needs id, title and opensWith (a bonus star id)`);
    });

  if (errors.length > n || !starter) return undefined;
  return {
    id: raw.id as string,
    title: raw.title as string,
    minutes: raw.minutes as number,
    concepts,
    boxes: boxes as string[],
    pointer: raw.pointer === true,
    hideEnd,
    ...(ui ? { ui } : {}),
    earlyLesson: raw.earlyLesson !== false,
    draft: raw.draft === true,
    ...(onWrongDefault ? { onWrongDefault } : {}),
    ...(onWrongDefaultGoto ? { onWrongDefaultGoto } : {}),
    starter,
    tabs: tabs as string[],
    scenes,
    nowYouCan: nowYouCan as string[],
    warmups,
    sideRooms,
    ghosts,
  };
}

const REGISTER_WORD = /\b(zero|ra|sp|gp|tp|fp|[ast]\d+|x\d+)\b/g;

/** Boxes (registers other than zero) a program names, by ABI name. */
export function registersIn(words: number[]): string[] {
  const out = new Set<string>();
  for (const w of words) {
    const d = decode(w);
    if (!d) continue;
    for (const m of d.operands.matchAll(REGISTER_WORD)) if (m[1] !== "zero") out.add(m[1]!);
  }
  return [...out].sort();
}

/** Checks that need the whole lesson: solutions use only the shown boxes, and early lessons stay tiny. */
function lessonLimits(lesson: Omit<Lesson, "solutions" | "checks">, solutions: SolutionDecl[], errors: string[]): void {
  for (const sol of solutions) {
    for (const r of registersIn(sol.words)) if (!lesson.boxes.includes(r)) errors.push(`solutions/${sol.file}: uses box ${r} but boxes lists only ${lesson.boxes.join(", ")}`);
  }
  if (lesson.hideEnd && !lesson.pointer && lesson.earlyLesson) {
    const over = (words: number[], where: string) => {
      if (words.length > EARLY_MAX_CARDS) errors.push(`${where}: an early lesson has at most ${EARLY_MAX_CARDS} cards (add "earlyLesson: false" to opt out)`);
    };
    over(lesson.starter.words, "starter");
    for (const w of lesson.warmups) over(w.program.words, `warmup "${w.id}"`);
    for (const sol of solutions) over(sol.words, `solutions/${sol.file}`);
    if (lesson.minutes > EARLY_MAX_MINUTES) errors.push(`lesson.yaml: an early lesson takes at most ${EARLY_MAX_MINUTES} minutes (add "earlyLesson: false" to opt out)`);
  }
}

function parseSolutions(files: Record<string, string>, stars: Set<string>, hideEnd: boolean, errors: string[]): SolutionDecl[] {
  const raw = yaml(files, "solutions/solutions.yaml", errors);
  const out: SolutionDecl[] = [];
  if (raw === undefined) return out;
  const list = isObj(raw) ? raw.solutions : undefined;
  if (!Array.isArray(list) || list.length === 0) {
    errors.push("solutions/solutions.yaml: solutions must be a non-empty list");
    return out;
  }
  const declared = new Set<string>();
  list.forEach((s, i) => {
    const where = `solutions/solutions.yaml: solutions[${i}]`;
    if (!isObj(s) || !isStr(s.file)) return void errors.push(`${where}: needs a file`);
    unknownKeys(s, ["file", "earns", "predictions", "stdin", "maxSteps", "capped", "note", "scenes"], where, errors);
    if (s.scenes !== undefined && !(isStrList(s.scenes) && s.scenes.length > 0)) errors.push(`${where}: scenes must be a list of scene ids`);
    const text = files[`solutions/${s.file}`];
    if (text === undefined) return void errors.push(`${where}: ${s.file} not found in solutions/`);
    declared.add(s.file);
    if (!isStrList(s.earns)) return void errors.push(`${where}: earns must be a list of star ids (empty for a wrong solution)`);
    for (const star of s.earns) if (!stars.has(star)) errors.push(`${where}: declares unknown star "${star}" (checks.feature awards: ${[...stars].join(", ") || "nothing"})`);
    if (s.capped !== undefined && typeof s.capped !== "boolean") errors.push(`${where}: capped must be true or false`);
    if (s.maxSteps !== undefined && !(Number.isInteger(s.maxSteps) && (s.maxSteps as number) >= 1 && (s.maxSteps as number) <= MAX_STEPS_CAP)) errors.push(`${where}: maxSteps must be a whole number from 1 to ${MAX_STEPS_CAP}`);
    if (s.stdin !== undefined && typeof s.stdin !== "string") errors.push(`${where}: stdin must be text`);
    let predictions: Record<string, number[]> = {};
    if (s.predictions !== undefined) {
      if (isObj(s.predictions) && Object.values(s.predictions).every((v) => Array.isArray(v) && v.every((x) => typeof x === "number"))) predictions = s.predictions as Record<string, number[]>;
      else errors.push(`${where}: predictions must map a target to a list of numbers`);
    }
    const label = `solutions/${s.file}`;
    const program = programOf(/\.hex$/.test(s.file) ? { hex: text } : { asm: text }, label, errors);
    if (hideEnd && program?.words.at(-1) === STOP_WORD) errors.push(`${label}: with hideEnd the end marker is added for you; remove the final Stop card (ebreak)`);
    if (!program || typeof s.capped === "string" || !isStrList(s.earns)) return;
    out.push({
      file: s.file,
      words: program.words,
      earns: s.earns,
      predictions,
      ...(typeof s.stdin === "string" ? { stdin: s.stdin } : {}),
      ...(typeof s.maxSteps === "number" ? { maxSteps: s.maxSteps } : {}),
      capped: s.capped === true,
      ...(isStrList(s.scenes) && s.scenes.length > 0 ? { scenes: s.scenes } : {}),
      ...(isStr(s.note) ? { note: s.note } : {}),
    });
  });
  for (const f of Object.keys(files)) {
    const m = /^solutions\/(.+)$/.exec(f);
    if (m && m[1] !== "solutions.yaml" && !declared.has(m[1]!)) errors.push(`${f} is not declared in solutions/solutions.yaml`);
  }
  return out;
}
