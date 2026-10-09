import type { Feature } from "./gherkin/parse";
import { MAX_FUNCTION_INPUT, parseRule, tableExpected, type LessonFunction } from "./function";
import { MAX_TABLE_ROWS, type Ask, type Lesson } from "./lesson";
import { registerNumber } from "./steps/run";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** A step phrase that names a function, such as `f(3) is 10` or `Then f(f(2)) is 26`. */
export const FUNCTION_PHRASE = /^(?:(?:given|when|then|and|but)\s+)?(?:([a-z][a-z0-9]*)\(|x is )/i;
const FUNCTION_ARGUMENT = /\(\s*(-?(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d+))\s*\)\)?\s+is\b/;
const NESTED_PHRASE = /^[a-z][a-z0-9]*\(\s*[a-z][a-z0-9]*\(/i;

/** Validate the `function` block of lesson.yaml: one input box, one output box and a rule that can be evaluated. */
export function parseFunction(input: unknown, boxes: string[], errors: string[]): LessonFunction | undefined {
  if (input === undefined) return undefined;
  const where = "lesson.yaml function";
  if (!isObj(input)) return void errors.push(`${where}: must be a mapping with name, inputs, output and rule`);
  for (const key of Object.keys(input)) if (!["name", "inputs", "output", "rule"].includes(key)) errors.push(`${where}: unknown key "${key}"`);
  const n = errors.length;
  const { name, inputs, output, rule } = input;
  if (typeof name !== "string" || !/^[a-z][a-z0-9]*$/.test(name)) errors.push(`${where}: name must be a short lowercase word like f`);
  const boxProblem = (box: unknown, role: string): void => {
    if (typeof box !== "string" || registerNumber(box) === undefined) errors.push(`${where}: ${role}: no box called '${String(box)}'`);
    else if (!boxes.includes(box)) errors.push(`${where}: ${role} uses box ${box} but boxes lists only ${boxes.join(", ")}`);
  };
  if (!Array.isArray(inputs) || inputs.length !== 1) errors.push(`${where}: inputs must list exactly one box (a rule has one x)`);
  else boxProblem(inputs[0], "inputs[0]");
  boxProblem(output, "output");
  if (typeof rule !== "string") errors.push(`${where}: rule must be text like "f(x) = x·x + 1"`);
  else if (typeof name === "string") {
    const parsed = parseRule(rule, name);
    if (!parsed.ok) errors.push(`${where}: rule: ${parsed.error}`);
  }
  if (errors.length > n) return undefined;
  return { name: name as string, inputs: inputs as string[], output: output as string, rule: rule as string };
}

/** Validate a `table` ask: the question, the inputs (whole numbers, no repeats) and the box that holds the answer. */
export function parseTableAsk(raw: Obj, question: string, where: string, errors: string[]): Ask | undefined {
  for (const key of Object.keys(raw)) if (!["kind", "question", "inputs", "target"].includes(key)) errors.push(`${where}: ask: unknown key "${key}"`);
  const inputs = raw.inputs;
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > MAX_TABLE_ROWS || !inputs.every((v) => Number.isInteger(v) && Math.abs(v as number) <= MAX_FUNCTION_INPUT)) {
    return void errors.push(`${where}: ask inputs must be a list of 1 to ${MAX_TABLE_ROWS} whole numbers, each from -${MAX_FUNCTION_INPUT} to ${MAX_FUNCTION_INPUT}`);
  }
  if (new Set(inputs).size !== inputs.length) return void errors.push(`${where}: ask inputs must not repeat a number`);
  if (!(typeof raw.target === "string" && registerNumber(raw.target) !== undefined)) return void errors.push(`${where}: ask target: no box called '${String(raw.target)}'`);
  return { kind: "table", question, inputs: inputs as number[], target: raw.target };
}

/** The numbers a step phrase such as `f(3) is 10` or `f(f(2)) is 26` feeds to the function. */
export function phraseInputs(phrase: string): number[] {
  const bare = phrase.replace(/^(?:given|when|then|and|but)\s+/i, "");
  const xIs = /^x is\s+(-?(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d+))$/i.exec(bare);
  const m = xIs ?? FUNCTION_ARGUMENT.exec(bare);
  if (!m) return [];
  const text = m[1]!.replace(/_/g, "");
  const negative = text.startsWith("-");
  const value = Number(negative ? text.slice(1) : text);
  return [negative ? -value : value];
}

/** True for a phrase like `f(f(2)) is 26`: its outer input is the rule applied to the inner one. */
export function isNestedPhrase(phrase: string): boolean {
  return NESTED_PHRASE.test(phrase.replace(/^(?:given|when|then|and|but)\s+/i, ""));
}

/** Check a scene's `input` (x fixed for the scene): a whole number in range, and the lesson must have a function. */
export function parseSceneInput(raw: unknown, where: string, errors: string[]): number | undefined {
  if (raw === undefined) return undefined;
  if (!(Number.isInteger(raw) && Math.abs(raw as number) <= MAX_FUNCTION_INPUT)) return void errors.push(`${where}: input must be a whole number from -${MAX_FUNCTION_INPUT} to ${MAX_FUNCTION_INPUT}`);
  return raw as number;
}

/** The function phrases used by a lesson: every `until`, every ask query and every step of checks.feature. */
function phrasesOf(lesson: Omit<Lesson, "solutions" | "checks">, feature: Feature | undefined): { where: string; phrase: string }[] {
  const out: { where: string; phrase: string }[] = [];
  for (const scene of lesson.scenes) {
    scene.until.forEach((phrase, k) => out.push({ where: `scene "${scene.id}": until[${k}]`, phrase }));
    if (scene.ask?.kind === "machine-query") out.push({ where: `scene "${scene.id}": ask query`, phrase: scene.ask.query });
  }
  for (const s of feature?.scenarios ?? []) for (const step of s.steps) out.push({ where: `checks.feature line ${step.line}`, phrase: step.text });
  return out.filter((p) => FUNCTION_PHRASE.test(p.phrase.trim()));
}

/** Rules that need the whole lesson: table asks need a function, and function phrases must name it. */
export function functionProblems(lesson: Omit<Lesson, "solutions" | "checks">, feature: Feature | undefined): string[] {
  const problems: string[] = [];
  const fn = lesson.function;
  for (const { where, phrase } of phrasesOf(lesson, feature)) {
    if (!fn) problems.push(`${where}: "${phrase}" needs a function block in lesson.yaml`);
    else {
      const names = [...phrase.replace(/^(?:given|when|then|and|but)\s+/i, "").matchAll(/\b([a-z][a-z0-9]*)\(/gi)].map((m) => m[1]!);
      for (const name of names) if (name !== fn.name) problems.push(`${where}: "${phrase}" names ${name} but the function is called ${fn.name}`);
    }
  }
  for (const scene of lesson.scenes) {
    if (scene.input !== undefined && !fn) problems.push(`scene "${scene.id}": input needs a function block in lesson.yaml`);
  }
  for (const scene of lesson.scenes) {
    const ask = scene.ask;
    if (ask?.kind !== "table") continue;
    const w = `scene "${scene.id}"`;
    if (!fn) {
      problems.push(`${w}: a table ask needs a function block in lesson.yaml`);
      continue;
    }
    if (!lesson.boxes.includes(ask.target)) problems.push(`${w}: ask uses box ${ask.target} but boxes lists only ${lesson.boxes.join(", ")}`);
    const expected = tableExpected(lesson, ask.inputs);
    ask.inputs.forEach((x, k) => {
      if (expected[k] === null) problems.push(`${w}: the starter program does not stop for input ${x}, so the table has no answer`);
    });
    scene.onWrong.forEach((o, k) => {
      const m = /^(-?\d+)(?::(-?\d+))?$/.exec(String(o.match));
      if (!m) return void problems.push(`${w}: onWrong[${k}]: a table ask needs a match like "2" (a row) or "2:4" (a row and the wrong value)`);
      const row = ask.inputs.indexOf(Number(m[1]));
      if (row < 0) return void problems.push(`${w}: onWrong[${k}]: ${m[1]} is not one of the table inputs ${ask.inputs.join(", ")}`);
      if (m[2] !== undefined && expected[row] === Number(m[2])) problems.push(`${w}: onWrong[${k}]: match "${o.match}" is the correct answer`);
    });
  }
  return problems;
}
