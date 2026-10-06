import { assemble, parseMachineCode } from "@sierrendipity/explorer";
import { parse as parseYaml } from "yaml";
import { parseFeature, GherkinError, type Feature } from "./gherkin/parse";
import { TARGET_PATTERN, validateGhost, type Ghost } from "./ghost";
import {
  ASK_KINDS,
  LOCKS,
  MAX_SENTENCES_PER_SCENE,
  MAX_STEPS_CAP,
  MAX_WORDS_PER_SCENE,
  SHOWABLE,
  TABS,
  publishLesson,
  type Ask,
  type Lesson,
  type OnWrong,
  type Program,
  type Scene,
  type SideRoom,
  type SolutionDecl,
  type Warmup,
} from "./lesson";
import { registerNumber, STOP_WORD } from "./steps/run";
import { featureProblems } from "./steps/checks";
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
  return text.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim() !== "").length;
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

function unknownKeys(obj: Obj, allowed: string[], where: string, errors: string[]): void {
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) errors.push(`${where}: unknown key "${k}"`);
}

function parseScene(raw: unknown, i: number, errors: string[]): Scene | undefined {
  if (!isObj(raw)) return void errors.push(`scenes[${i}] must be a mapping`);
  const id = raw.id;
  if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) return void errors.push(`scenes[${i}]: id must be a lowercase slug`);
  const w = `scene "${id}"`;
  const n = errors.length;
  unknownKeys(raw, ["id", "say", "show", "spotlight", "ask", "until", "onWrong", "hints", "showMe", "lock", "skippable"], w, errors);

  const say = raw.say;
  if (!isStr(say)) errors.push(`${w}: say must be non-empty text`);
  else {
    if (countSentences(say) > MAX_SENTENCES_PER_SCENE) errors.push(`${w}: say has ${countSentences(say)} sentences (at most ${MAX_SENTENCES_PER_SCENE} sentences)`);
    if (countWords(say) > MAX_WORDS_PER_SCENE) errors.push(`${w}: say has ${countWords(say)} words (at most ${MAX_WORDS_PER_SCENE} words)`);
  }
  const show = raw.show === undefined ? [] : raw.show;
  if (!isStrList(show)) errors.push(`${w}: show must be a list of names`);
  else for (const s of show) if (!SHOWABLE.includes(s)) errors.push(`${w}: unknown thing to show "${s}" (use ${SHOWABLE.join(", ")})`);
  if (raw.spotlight !== undefined && !(typeof raw.spotlight === "string" && TARGET_PATTERN.test(raw.spotlight))) {
    errors.push(`${w}: spotlight ${JSON.stringify(raw.spotlight)} is not a valid target (like "button:step" or "box:a2")`);
  }
  let ask: Ask | undefined;
  if (raw.ask !== undefined) ask = parseAsk(raw.ask, w, errors);

  const until = raw.until === undefined ? [] : raw.until;
  if (!isStrList(until)) errors.push(`${w}: until must be a list of step phrases`);
  else
    until.forEach((phrase, k) => {
      const p = parseStep(phrase);
      if (!p.ok) errors.push(`${w}: until[${k}]: ${p.error}`);
    });

  const hints = raw.hints;
  const needsHints = (Array.isArray(until) && until.length > 0) || ask !== undefined;
  if (hints === undefined ? needsHints : !(Array.isArray(hints) && hints.length === 3 && hints.every(isStr))) {
    errors.push(`${w}: needs exactly 3 hints, each a non-empty line (nudge, narrower question, near-answer)`);
  }
  const lock = raw.lock === undefined ? [] : raw.lock;
  if (!isStrList(lock)) errors.push(`${w}: lock must be a list`);
  else for (const l of lock) if (!(LOCKS as readonly string[]).includes(l)) errors.push(`${w}: unknown lock "${l}" (use ${LOCKS.join(", ")})`);
  if (raw.skippable !== undefined && typeof raw.skippable !== "boolean") errors.push(`${w}: skippable must be true or false`);
  if (raw.showMe !== undefined && !isStr(raw.showMe)) errors.push(`${w}: showMe must be a ghost id`);

  const onWrong: OnWrong[] = [];
  if (raw.onWrong !== undefined) {
    if (!Array.isArray(raw.onWrong)) errors.push(`${w}: onWrong must be a list`);
    else
      raw.onWrong.forEach((o, k) => {
        if (!isObj(o) || !(typeof o.match === "number" || isStr(o.match)) || !isStr(o.say)) return void errors.push(`${w}: onWrong[${k}] needs match (a number or text) and say`);
        unknownKeys(o, ["match", "say", "goto"], `${w}: onWrong[${k}]`, errors);
        if (countWords(o.say) > MAX_WORDS_PER_SCENE || countSentences(o.say) > MAX_SENTENCES_PER_SCENE) errors.push(`${w}: onWrong[${k}].say is too long (at most ${MAX_SENTENCES_PER_SCENE} sentences, ${MAX_WORDS_PER_SCENE} words)`);
        if (o.goto !== undefined && !isStr(o.goto)) errors.push(`${w}: onWrong[${k}].goto must be a scene id`);
        onWrong.push({ match: o.match as number | string, say: o.say, ...(o.goto ? { goto: String(o.goto) } : {}) });
      });
  }
  if (errors.length > n) return undefined;
  return {
    id,
    say: say as string,
    show: show as string[],
    ...(raw.spotlight ? { spotlight: raw.spotlight as string } : {}),
    ...(ask ? { ask } : {}),
    until: until as string[],
    onWrong,
    hints: (hints as string[] | undefined) ?? [],
    ...(raw.showMe ? { showMe: raw.showMe as string } : {}),
    lock: lock as string[],
    skippable: raw.skippable === true,
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

  if (errors.length || !lesson || !feature) return { ok: false, errors };
  return { ok: true, lesson: { ...lesson, checks: feature, solutions } };
}

function parseLessonYaml(raw: unknown, ghosts: Record<string, Ghost>, known: Set<string> | undefined, dir: string | undefined, errors: string[]): Omit<Lesson, "solutions" | "checks"> | undefined {
  const n = errors.length;
  if (!isObj(raw)) return void errors.push("lesson.yaml: must be a mapping");
  unknownKeys(raw, ["id", "title", "minutes", "concepts", "boxes", "pointer", "hideEnd", "starter", "tabs", "scenes", "nowYouCan", "warmups", "sideRooms"], "lesson.yaml", errors);

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
  for (const key of ["pointer", "hideEnd"] as const) if (raw[key] !== undefined && typeof raw[key] !== "boolean") errors.push(`lesson.yaml: ${key} must be true or false`);
  const hideEnd = raw.hideEnd === true;
  const endProblem = (p: Program | undefined, where: string): void => {
    if (hideEnd && p && p.words.at(-1) === STOP_WORD) errors.push(`${where}: with hideEnd the end marker is added for you; remove the final Stop card (ebreak)`);
  };
  const starter = programOf(raw.starter, "starter", errors);
  endProblem(starter, "starter");
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
      const scene = parseScene(s, i, errors);
      if (scene) scenes.push(scene);
    });
    for (const s of scenes) {
      if (s.showMe !== undefined && !(s.showMe in ghosts)) errors.push(`scene "${s.id}": showMe: no ghost "${s.showMe}" in ghosts/`);
      s.onWrong.forEach((o, k) => {
        if (o.goto !== undefined && !ids.has(o.goto)) errors.push(`scene "${s.id}": onWrong[${k}].goto unknown scene "${o.goto}"`);
      });
    }
  }

  const nowYouCan = raw.nowYouCan ?? [];
  if (!isStrList(nowYouCan)) errors.push("lesson.yaml: nowYouCan must be a list of short lines");

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
      if (typeof w.expected !== "number") errors.push(`${where}: expected must be a number`);
      if (!(typeof w.target === "string" && registerNumber(w.target) !== undefined)) errors.push(`${where}: target: no box called '${String(w.target)}'`);
      let startRegs: Record<string, number> | undefined;
      if (w.startRegs !== undefined) {
        if (isObj(w.startRegs) && Object.entries(w.startRegs).every(([k, v]) => registerNumber(k) !== undefined && typeof v === "number")) startRegs = w.startRegs as Record<string, number>;
        else errors.push(`${where}: startRegs must map box names to numbers`);
      }
      const program = programOf(w.program, `${where}: program`, errors);
      endProblem(program, `${where}: program`);
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
    starter,
    tabs: tabs as string[],
    scenes,
    nowYouCan: nowYouCan as string[],
    warmups,
    sideRooms,
    ghosts,
  };
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
    unknownKeys(s, ["file", "earns", "predictions", "stdin", "maxSteps", "capped", "note"], where, errors);
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
      ...(isStr(s.note) ? { note: s.note } : {}),
    });
  });
  for (const f of Object.keys(files)) {
    const m = /^solutions\/(.+)$/.exec(f);
    if (m && m[1] !== "solutions.yaml" && !declared.has(m[1]!)) errors.push(`${f} is not declared in solutions/solutions.yaml`);
  }
  return out;
}
