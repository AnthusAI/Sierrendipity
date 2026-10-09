import type { Lesson } from "./lesson";
import { DEFAULT_FUNCTION_INPUT, functionValue, parseRule, ruleFits, ruleValue } from "./function";
import { FUNCTION_PHRASE, isNestedPhrase, phraseInputs } from "./loader-function";
import { earnedStars, runChecks, starOf } from "./steps/checks";
import { DEFAULT_MAX_STEPS, registerNumber, runProgram, type LessonEvent, type RunOptions } from "./steps/run";
import { parseStep } from "./steps/table";

export interface SolutionReport {
  file: string;
  declared: string[];
  earned: string[];
  steps: number;
  cards: number;
  hitStepCap: boolean;
  problems: string[];
}
export interface LessonReport {
  id: string;
  solutions: SolutionReport[];
  problems: string[];
  ok: boolean;
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const list = (a: string[]): string => (a.length ? a.join(", ") : "nothing");

/** Run every reference solution and warm-up of a loaded lesson and compare with what it declares. */
export function checkLesson(lesson: Lesson): LessonReport {
  const problems: string[] = [];
  if (!lesson.checks.scenarios.some((s) => s.tags.includes("pass"))) problems.push("the lesson has no @pass scenario");

  const declaredStars = new Set(lesson.solutions.flatMap((d) => d.earns));
  if (!declaredStars.has("pass")) problems.push("no solution is declared to earn pass");
  for (const sc of lesson.checks.scenarios) {
    const star = starOf(sc.tags);
    if (star && star !== "pass" && !declaredStars.has(star)) problems.push(`no solution is declared to earn the bonus "${star}"`);
  }
  if (!lesson.solutions.some((d) => d.earns.length === 0 && !d.capped)) problems.push("solutions need at least one wrong solution (earns: [] and not capped)");

  const solutions = lesson.solutions.map((decl): SolutionReport => {
    const run = runProgram(decl.words, {
      ...(functionFacts(lesson)),
      ...(decl.stdin !== undefined ? { stdin: decl.stdin } : {}),
      maxSteps: decl.maxSteps ?? DEFAULT_MAX_STEPS,
      predictions: decl.predictions,
      starter: lesson.starter.words,
      hideEnd: lesson.hideEnd,
      events: tableEvents(lesson),
    });
    const report = runChecks(lesson.checks, run);
    const earned = earnedStars(report);
    const out: string[] = [];
    if (!same(earned, decl.earns)) {
      const extra = earned.filter((s) => !decl.earns.includes(s));
      const missing = decl.earns.filter((s) => !earned.includes(s));
      if (decl.earns.length === 0 && earned.includes("pass")) out.push("a wrong solution passes: it is declared to earn nothing but earns pass");
      else if (decl.earns.includes("pass") && !earned.includes("pass")) {
        out.push(`declared to pass but fails @pass: ${report.scenarios.find((s) => s.tags.includes("pass"))?.failures[0] ?? "unknown"}`);
      }
      out.push(`earns ${list(earned)} but is declared to earn ${list(decl.earns)}${extra.length ? `; unexpected: ${extra.join(", ")}` : ""}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
    }
    if (decl.capped && !run.hitStepCap) out.push(`declared capped (never terminating) but stopped by itself after ${run.steps} steps (${run.machine.state})`);
    if (!decl.capped && run.hitStepCap) out.push(`was stopped by the step cap after ${run.steps} steps but is not declared capped`);
    return { file: decl.file, declared: decl.earns, earned, steps: run.steps, cards: run.cards, hitStepCap: run.hitStepCap, problems: out };
  });

  sceneProblems(lesson, problems);
  ruleProblems(lesson, problems);

  for (const w of lesson.warmups) {
    const run = runProgram(w.program.words, { hideEnd: lesson.hideEnd, ...(w.startRegs ? { startRegs: w.startRegs } : {}) });
    const index = registerNumber(w.target);
    const have = index === undefined ? undefined : run.machine.regs[index]! | 0;
    if (run.hitStepCap || run.machine.state !== "halted") problems.push(`warmup "${w.id}": the program does not halt (${run.machine.state})`);
    else if (have !== (w.expected | 0)) problems.push(`warmup "${w.id}": ${w.target} holds ${have} but expected is ${w.expected}`);
  }

  for (const s of solutions) for (const p of s.problems) problems.push(`${s.file}: ${p}`);
  return { id: lesson.id, solutions, problems, ok: problems.length === 0 };
}

/** Phrases about the student's UI actions that no reference solution run can show. */
const UI_ONLY = /^(?:the student (?:rewound|toggled|filled)|the timeline)/i;

/** Scene content must agree with the machine: asks have the right answer, untils can be met. */
function sceneProblems(lesson: Lesson, problems: string[]): void {
  const starterAt = (x: number) => runProgram(lesson.starter.words, { hideEnd: lesson.hideEnd, events: tableEvents(lesson), ...functionFacts(lesson, x) });
  for (const sc of lesson.scenes) {
    if (sc.ask?.kind === "number" && sc.ask.target) {
      const starterRun = starterAt(sceneInput(sc));
      const index = registerNumber(sc.ask.target);
      const have = index === undefined ? undefined : starterRun.machine.regs[index]! | 0;
      if (have !== (sc.ask.answer | 0)) problems.push(`scene "${sc.id}": ask answer ${sc.ask.answer} but the starter produces ${have} in ${sc.ask.target}`);
    }
  }

  // Any other wrong answer goes to the next scene unless the lesson says where: that scene must reveal the answer.
  if (lesson.onWrongDefaultGoto === undefined) {
    lesson.scenes.forEach((sc, i) => {
      const next = lesson.scenes[i + 1];
      if (sc.ask && next && next.until.length === 0) problems.push(`scene "${sc.id}": onWrongDefault needs a goto to the scene that reveals the answer, because the next scene "${next.id}" does not wait on the machine`);
    });
  }

  const passing = lesson.solutions.filter((d) => d.earns.includes("pass"));
  const runOf = (d: (typeof lesson.solutions)[number], x: number) => {
    // The student's edits are the cards that differ from the starter.
    const edits = d.words.flatMap((w, card) => (w !== lesson.starter.words[card] ? [{ type: "edit" as const, card, to: w }] : []));
    const events = [...edits, ...tableEvents(lesson)];
    return runProgram(d.words, { predictions: d.predictions, hideEnd: lesson.hideEnd, starter: lesson.starter.words, events, ...functionFacts(lesson, x), maxSteps: d.maxSteps ?? DEFAULT_MAX_STEPS });
  };
  for (const sc of lesson.scenes) {
    const x = sceneInput(sc);
    const runs = passing.map((d) => runOf(d, x));
    // A scene may also describe the machine before the student has changed anything: the starter itself.
    runs.push(starterAt(x));
    // Solutions that name this scene (`scenes:` in solutions.yaml) are a way to finish it without passing the lesson.
    const own = lesson.solutions.filter((d) => d.scenes?.includes(sc.id)).map((d) => runOf(d, x));
    for (const phrase of sc.until) {
      if (UI_ONLY.test(phrase)) continue;
      const parsed = parseStep(phrase);
      if (!parsed.ok) continue;
      if (![...runs, ...own].some((r) => parsed.fn(r).ok)) problems.push(`scene "${sc.id}": no pass solution (or the starter) satisfies "${phrase}", so the scene could never finish`);
    }
  }
}

/** The x a scene is judged at: its fixed `input`, else the number its `x is N` goal waits for, else the default x. */
function sceneInput(scene: Lesson["scenes"][number]): number {
  if (scene.input !== undefined) return scene.input;
  for (const phrase of scene.until) if (/^(?:(?:given|when|then|and|but)\s+)?x is /i.test(phrase.trim())) return phraseInputs(phrase)[0] ?? DEFAULT_FUNCTION_INPUT;
  return DEFAULT_FUNCTION_INPUT;
}

/** The function boxes a run needs for phrases such as `f(3) is 10`, and the input box holding the default x, when the lesson declares a function. */
function functionFacts(lesson: Lesson, x: number = DEFAULT_FUNCTION_INPUT): Pick<RunOptions, "functionBoxes" | "startRegs" | "functionInput"> {
  const fn = lesson.function;
  return fn ? { functionBoxes: { name: fn.name, input: fn.inputs[0]!, output: fn.output }, startRegs: { [fn.inputs[0]!]: x }, functionInput: x } : {};
}

/** A reference solution is assumed to fill every table of the lesson correctly; the checker proves the answers separately. */
function tableEvents(lesson: Lesson): LessonEvent[] {
  return lesson.scenes.flatMap((sc) => (sc.ask?.kind === "table" ? [{ type: "table" as const, inputs: sc.ask.inputs }] : []));
}

/** The inputs a lesson lists for its function: table rows and the numbers in function phrases, or 1, 2, 3 when it lists none. */
function listedInputs(lesson: Lesson): number[] {
  const rule = lesson.function ? parseRule(lesson.function.rule, lesson.function.name) : undefined;
  const nestedOuterInputs = (_lesson: Lesson, found: string[]): number[] =>
    rule?.ok ? found.filter(isNestedPhrase).flatMap((p) => phraseInputs(p).map((x) => ruleValue(rule.rule, x))) : [];
  const phrases = [
    ...lesson.scenes.flatMap((sc) => sc.until),
    ...lesson.checks.scenarios.flatMap((sc) => sc.steps.map((st) => st.text)),
  ].filter((p) => FUNCTION_PHRASE.test(p.trim()));
  const listed = [...lesson.scenes.flatMap((sc) => (sc.ask?.kind === "table" ? sc.ask.inputs : [])), ...phrases.flatMap(phraseInputs), ...nestedOuterInputs(lesson, phrases)];
  return listed.length > 0 ? [...new Set(listed)] : [1, 2, 3];
}

/**
 * The declared rule must agree with the program on every listed input. The programs are every reference
 * solution that earns pass, and the starter when the lesson has a table (the table's answers come from it).
 */
function ruleProblems(lesson: Lesson, problems: string[]): void {
  const fn = lesson.function;
  if (!fn) return;
  const parsed = parseRule(fn.rule, fn.name);
  if (!parsed.ok) return void problems.push(`function rule: ${parsed.error}`);
  const boxes = { name: fn.name, input: fn.inputs[0]!, output: fn.output };
  const programs = lesson.solutions.filter((d) => d.earns.includes("pass")).map((d) => ({ label: `solution ${d.file}`, words: d.words }));
  if (lesson.scenes.some((sc) => sc.ask?.kind === "table")) programs.push({ label: "the starter", words: lesson.starter.words });
  for (const x of listedInputs(lesson)) {
    if (!ruleFits(parsed.rule, x)) problems.push(`rule ${fn.rule} is too big for a box at ${fn.name}(${x})`);
  }
  for (const program of programs) {
    for (const x of listedInputs(lesson)) {
      const have = functionValue(program.words, boxes, x, { hideEnd: lesson.hideEnd });
      const want = ruleValue(parsed.rule, x);
      if (have === null) problems.push(`rule ${fn.rule}: ${program.label} does not stop for ${fn.name}(${x})`);
      else if (have !== want) problems.push(`rule ${fn.rule} says ${fn.name}(${x}) is ${want} but ${program.label} gives ${have}`);
    }
  }
}
