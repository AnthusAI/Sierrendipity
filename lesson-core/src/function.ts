import { registerNumber, runProgram } from "./steps/run";

/** A lesson's function: one input box, one output box and the rule the program must agree with. */
export interface LessonFunction {
  name: string;
  inputs: string[];
  output: string;
  rule: string;
}

/** The boxes a run uses to evaluate a function phrase such as `f(3) is 10`. */
export interface FunctionBoxes {
  name: string;
  input: string;
  output: string;
}

export const MAX_RULE_CHARS = 60;
/** The x a function lesson starts with, in the player and in the checker, until the student sets another. */
export const DEFAULT_FUNCTION_INPUT = 1;
/** The most the student may type for x, and the most a lesson may list (keeps the banner short). */
export const MAX_FUNCTION_INPUT = 99_999;
/** Most steps a function evaluation may take; a program that needs more does not finish. */
export const FUNCTION_MAX_STEPS = 1000;

type Operator = "+" | "-" | "*";
type Expression =
  | { kind: "number"; value: bigint }
  | { kind: "x" }
  | { kind: "negate"; inner: Expression }
  | { kind: "group"; inner: Expression }
  | { kind: "binary"; operator: Operator; left: Expression; right: Expression };

export interface ParsedRule {
  name: string;
  expression: Expression;
}
export type RuleResult = { ok: true; rule: ParsedRule } | { ok: false; error: string };

const MULTIPLY_SIGNS = new Set(["*", "·", "×"]);

function tokensOf(text: string): string[] | string {
  const tokens: string[] = [];
  let at = 0;
  while (at < text.length) {
    const ch = text[at]!;
    if (/\s/.test(ch)) at++;
    else if (/\d/.test(ch)) {
      let end = at;
      while (end < text.length && /\d/.test(text[end]!)) end++;
      tokens.push(text.slice(at, end));
      at = end;
    } else if (ch === "x" || ch === "+" || ch === "-" || ch === "(" || ch === ")" || MULTIPLY_SIGNS.has(ch)) {
      tokens.push(MULTIPLY_SIGNS.has(ch) ? "*" : ch);
      at++;
    } else return `the rule has '${ch}', which is not a number, x, + - * or a bracket`;
  }
  return tokens;
}

/**
 * Parse a rule such as `f(x) = x·x + 1`. Grammar:
 *   rule   = name "(x)" "=" sum
 *   sum    = product { ("+" | "-") product }
 *   product = factor { ("*" | "·" | "×") factor }
 *   factor = whole number | "x" | "(" sum ")" | "-" factor
 */
export function parseRule(text: string, name: string): RuleResult {
  if (text.length > MAX_RULE_CHARS) return { ok: false, error: `the rule is too long (at most ${MAX_RULE_CHARS} characters)` };
  const head = /^\s*([a-z][a-z0-9]*)\s*\(\s*x\s*\)\s*=\s*(.*)$/.exec(text);
  if (!head) return { ok: false, error: `the rule must look like "${name}(x) = x·x + 1"` };
  if (head[1] !== name) return { ok: false, error: `the rule names the function "${head[1]}" but the function is called "${name}"` };
  const tokens = tokensOf(head[2]!);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  if (tokens.length === 0) return { ok: false, error: "the rule has nothing after the equals sign" };
  let at = 0;
  let failure: string | null = null;
  const fail = (message: string): Expression => {
    failure ??= message;
    return { kind: "x" };
  };
  const factor = (): Expression => {
    const token = tokens[at];
    if (token === undefined) return fail("the rule ends too soon");
    at++;
    if (/^\d+$/.test(token)) return { kind: "number", value: BigInt(token) };
    if (token === "x") return { kind: "x" };
    if (token === "-") return { kind: "negate", inner: factor() };
    if (token === "(") {
      const inner = sum();
      if (tokens[at] !== ")") return fail("a bracket is not closed");
      at++;
      return { kind: "group", inner };
    }
    return fail(`the rule has '${token}' where a number, x or a bracket should be`);
  };
  const product = (): Expression => {
    let left = factor();
    while (tokens[at] === "*") {
      at++;
      left = { kind: "binary", operator: "*", left, right: factor() };
    }
    return left;
  };
  const sum = (): Expression => {
    let left = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const operator = tokens[at++] as Operator;
      left = { kind: "binary", operator, left, right: product() };
    }
    return left;
  };
  const expression = sum();
  if (failure === null && at < tokens.length) failure = `the rule has '${tokens[at]}' where it should end`;
  if (failure !== null) return { ok: false, error: failure };
  return { ok: true, rule: { name, expression } };
}

function evaluate(expression: Expression, x: bigint): bigint {
  switch (expression.kind) {
    case "number":
      return expression.value;
    case "x":
      return x;
    case "negate":
      return -evaluate(expression.inner, x);
    case "group":
      return evaluate(expression.inner, x);
    case "binary": {
      const left = evaluate(expression.left, x);
      const right = evaluate(expression.right, x);
      return expression.operator === "+" ? left + right : expression.operator === "-" ? left - right : left * right;
    }
  }
}

const BOX_MIN = -(2n ** 31n);
const BOX_MAX = 2n ** 31n - 1n;

function fits(expression: Expression, x: bigint): boolean {
  const inBox = (v: bigint): boolean => v >= BOX_MIN && v <= BOX_MAX;
  switch (expression.kind) {
    case "number":
      return inBox(expression.value);
    case "x":
      return inBox(x);
    case "negate":
    case "group":
      return fits(expression.inner, x) && inBox(evaluate(expression, x));
    case "binary":
      return fits(expression.left, x) && fits(expression.right, x) && inBox(evaluate(expression, x));
  }
}

/** True when every step of the rule stays inside a box (32 bits, signed) for `x`: then the equation is true arithmetic, not a wrapped number. */
export function ruleFits(rule: ParsedRule, x: number): boolean {
  return fits(rule.expression, BigInt(x));
}

/** The value of the rule for `x`, as a signed 32-bit number (the size of a box). */
export function ruleValue(rule: ParsedRule, x: number): number {
  return Number(BigInt.asIntN(32, evaluate(rule.expression, BigInt(x))));
}

function render(expression: Expression, x: number | null): string {
  switch (expression.kind) {
    case "number":
      return expression.value.toString();
    case "x":
      return x === null ? "x" : x < 0 ? `(${x})` : String(x);
    case "negate": {
      const inner = render(expression.inner, x);
      return expression.inner.kind === "negate" ? `-(${inner})` : `-${inner}`;
    }
    case "group":
      return `(${render(expression.inner, x)})`;
    case "binary": {
      const left = render(expression.left, x);
      const rawRight = render(expression.right, x);
      const right = expression.right.kind === "negate" ? `(${rawRight})` : rawRight;
      return expression.operator === "*" ? `${left}·${right}` : `${left} ${expression.operator} ${right}`;
    }
  }
}

/** The rule as written to the student: `f(x) = x·x + 1`. */
export function ruleText(rule: ParsedRule): string {
  return `${rule.name}(x) = ${render(rule.expression, null)}`;
}

/** The rule with a number in place of x and the answer: `f(7) = 7·7 + 1 = 50`. When the numbers do not fit in a box it says so instead of printing a wrapped result. */
export function ruleSubstitution(rule: ParsedRule, x: number): string {
  if (!ruleFits(rule, x)) return `${rule.name}(${x}) is too big for a box`;
  return `${rule.name}(${x}) = ${render(rule.expression, x)} = ${ruleValue(rule, x)}`;
}

/** What the machine says about the rule, in words (never only a colour): not finished, the same, or different. */
export function ruleStatus(output: string, finished: boolean, held: number, expected: number, trouble?: "fault" | "limit" | "too-big"): string {
  if (trouble === "too-big") return `The rule gives a number that does not fit in a box. Choose a smaller number for x.`;
  if (trouble === "fault") return `The program stopped with a fault. Box ${output} holds ${held}.`;
  if (trouble === "limit") return `The program kept running and was stopped. Box ${output} holds ${held}.`;
  if (!finished) return `The program has not finished. Box ${output} holds ${held}.`;
  if (held === expected) return `Box ${output} holds ${held}. This is the same as the rule.`;
  return `Box ${output} holds ${held}. The rule gives ${expected}. These are different.`;
}

/**
 * Run a program from a fresh machine with the input box set to `x` and read the output box.
 * Null when the program does not stop by itself within the step limit.
 */
export function functionValue(cards: number[], boxes: FunctionBoxes, x: number, opts: { hideEnd?: boolean } = {}): number | null {
  const run = runProgram(cards, { startRegs: { [boxes.input]: x }, maxSteps: FUNCTION_MAX_STEPS, hideEnd: opts.hideEnd === true });
  if (run.hitStepCap || run.machine.state !== "halted") return null;
  const index = registerNumber(boxes.output);
  return index === undefined ? null : run.machine.regs[index]! | 0;
}

/** The right answer for each table input: the starter program run on that input. Null where it does not stop. */
export function tableExpected(lesson: { function?: LessonFunction; starter: { words: number[] }; hideEnd: boolean }, inputs: number[]): (number | null)[] {
  const fn = lesson.function;
  if (!fn) return inputs.map(() => null);
  const boxes = { name: fn.name, input: fn.inputs[0]!, output: fn.output };
  return inputs.map((x) => functionValue(lesson.starter.words, boxes, x, { hideEnd: lesson.hideEnd }));
}
