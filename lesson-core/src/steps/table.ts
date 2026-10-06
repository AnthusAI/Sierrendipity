import { decode } from "@sierrendipity/explorer";
import { mnemonicsOf, PIXEL_BASE, PIXEL_COUNT, registerNumber, type LessonRun } from "./run";

export interface StepResult {
  ok: boolean;
  message: string;
}
export type StepFn = (run: LessonRun) => StepResult;
export type ParsedStep =
  | { ok: true; fn: StepFn; id: string }
  | { ok: false; error: string; suggestions: string[] };

/** A phrase that matched its pattern but has a bad argument. */
class PhraseError extends Error {}

const NUM = String.raw`-?(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d+)`;
const STR = String.raw`"(?:[^"\\]|\\.)*"`;

const MNEMONICS = new Set(
  (
    "lui auipc jal jalr beq bne blt bge bltu bgeu lb lh lw lbu lhu sb sh sw addi slti sltiu xori ori andi " +
    "slli srli srai add sub sll slt sltu xor srl sra or and mul mulh mulhsu mulhu div divu rem remu " +
    "fence ecall ebreak"
  ).split(" "),
);

const ok = (message: string): StepResult => ({ ok: true, message });
const no = (message: string): StepResult => ({ ok: false, message });
const pass = (cond: boolean, yes: string, nope: string): StepResult => (cond ? ok(yes) : no(nope));

function num(text: string | undefined): number {
  const t = (text ?? "").replace(/_/g, "");
  const neg = t.startsWith("-");
  const body = neg ? t.slice(1) : t;
  let v: number;
  if (/^0x[0-9a-f]+$/i.test(body)) v = parseInt(body.slice(2), 16);
  else if (/^0b[01]+$/i.test(body)) v = parseInt(body.slice(2), 2);
  else if (/^\d+$/.test(body)) v = Number(body);
  else throw new PhraseError(`'${text}' is not a number`);
  return neg ? -v : v;
}
/** A 32-bit value, signed or unsigned, normalised to an unsigned word. */
function word32(text: string | undefined): number {
  const v = num(text);
  if (v < -(2 ** 31) || v > 2 ** 32 - 1) throw new PhraseError(`${text} is out of range for a 32-bit box (-2147483648 to 4294967295)`);
  return v >>> 0;
}
function count(text: string | undefined, min = 0): number {
  const v = num(text);
  if (!Number.isInteger(v) || v < min) throw new PhraseError(`'${text}' must be a whole number, at least ${min}`);
  return v;
}
function address(text: string | undefined, align = 1): number {
  const v = num(text);
  if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new PhraseError(`address '${text}' is out of range`);
  if (v % align !== 0) throw new PhraseError(`address ${v} must be a multiple of ${align}`);
  return v;
}
function str(text: string | undefined): string {
  const inner = (text ?? "").slice(1, -1);
  return inner.replace(/\\(.)/g, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
}
function reg(text: string | undefined): number {
  const n = registerNumber(text ?? "");
  if (n === undefined) throw new PhraseError(`there is no box called '${text}' (use a name like a2 or zero, or x12)`);
  return n;
}
function mnemonics(text: string | undefined): string[] {
  const list = (text ?? "").split(/\s*,\s*|\s+and\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) throw new PhraseError("the list of cards is empty");
  for (const m of list) if (!MNEMONICS.has(m)) throw new PhraseError(`'${m}' is not a card (instruction) name`);
  return list;
}
function bytesAt(run: LessonRun, addr: number, length: number): Uint8Array | null {
  try {
    return run.machine.readMem(addr, length);
  } catch {
    return null;
  }
}
const signed = (n: number): number => n | 0;
const hex = (n: number): string => `0x${(n >>> 0).toString(16)}`;
const popcount = (n: number): number => {
  let c = 0;
  for (let v = n >>> 0; v; v &= v - 1) c++;
  return c;
};
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

type G = Record<string, string | undefined>;
interface Phrase {
  /** A concrete example, used for suggestions and docs. */
  example: string;
  pattern: RegExp;
  make: (g: G) => StepFn;
}

const P = (example: string, pattern: string, make: (g: G) => StepFn): Phrase => ({
  example,
  pattern: new RegExp(`^${pattern}$`, "i"),
  make,
});

export const PHRASES: Phrase[] = [
  P("the machine halted normally", "the machine halted normally", () => (run) => {
    const m = run.machine;
    return pass(
      m.state === "halted" && (m.exitCode === null || m.exitCode === 0),
      "the machine halted normally",
      `the machine ${m.state === "halted" ? `halted with exit code ${m.exitCode}` : `is ${m.state}${m.fault ? ` (${m.fault})` : ""}`}`,
    );
  }),
  P("the machine halted with exit code 3", `the machine halted with exit code (?<n>${NUM})`, (g) => {
    const want = count(g.n!, 0);
    return (run) =>
      pass(run.machine.state === "halted" && run.machine.exitCode === want, `exit code ${want}`, `exit code was ${run.machine.state === "halted" ? run.machine.exitCode : `none (${run.machine.state})`}`);
  }),
  P('the machine faulted with "illegal"', `the machine faulted(?: with (?<msg>${STR}))?`, (g) => {
    const msg = g.msg === undefined ? undefined : str(g.msg);
    return (run) => {
      const f = run.machine.fault;
      if (run.machine.state !== "faulted") return no(`the machine did not fault (it is ${run.machine.state})`);
      if (msg !== undefined && !(f ?? "").toLowerCase().includes(msg.toLowerCase())) return no(`the fault was "${f}"`);
      return ok(`the machine faulted: ${f}`);
    };
  }),
  P("the machine has taken at least 3 steps", `the machine has taken (?<least>at least )?(?<n>${NUM}) steps?`, (g) => {
    const n = count(g.n!, 0);
    const least = g.least !== undefined;
    return (run) => pass(least ? run.steps >= n : run.steps === n, `${plural(run.steps, "step", "steps")}`, `the machine has taken ${plural(run.steps, "step", "steps")}`);
  }),
  P("box a2 holds 12", `(?:box (?<reg>\\S+)|the box) (?:still )?(?<not>does not )?(?:holds?|shows?) (?<v>${NUM})`, (g) => {
    const r = reg(g.reg ?? "a0"); // "the box" is the first box, a0
    const want = word32(g.v);
    const negate = g.not !== undefined;
    const name = g.reg ?? "a0";
    return (run) => {
      const have = run.machine.regs[r]! >>> 0;
      if (negate) return pass(have !== want, `box ${name} holds ${signed(have)}`, `box ${name} holds ${g.v}`);
      return pass(have === want, `box ${name} holds ${signed(have)}`, `box ${name} holds ${signed(have)}${have > 0x7fffffff ? ` (${have})` : ""}, not ${g.v}`);
    };
  }),
  P("the machine reached the end", "the machine reached the end", () => (run) => {
    const m = run.machine;
    const atEnd = m.state === "halted" && m.exitCode === null && m.pc === (run.words.length - 1) * 4;
    return pass(atEnd, "the machine reached the end of the list", m.state === "halted" ? "the machine stopped before the end of the list" : `the machine has not reached the end (it is ${m.state})`);
  }),
  P("memory at 1024 holds 3", `memory at (?<a>${NUM}) holds (?<v>${NUM})`, (g) => {
    const a = address(g.a);
    const v = num(g.v);
    if (v < -128 || v > 255) throw new PhraseError(`${g.v} does not fit in one byte (-128 to 255)`);
    return (run) => {
      const b = bytesAt(run, a, 1);
      if (!b) return no(`address ${a} is outside memory`);
      return pass(b[0] === (v & 0xff), `memory at ${a} holds ${b[0]}`, `memory at ${a} holds ${b[0]}, not ${v}`);
    };
  }),
  P("shelf 1040 holds 3", `shelf (?<a>${NUM}) holds (?<v>${NUM})`, (g) => {
    const a = address(g.a, 4);
    const v = word32(g.v);
    return (run) => {
      const b = bytesAt(run, a, 4);
      if (!b) return no(`address ${a} is outside memory`);
      const have = new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
      return pass(have === v, `shelf ${a} holds ${signed(have)}`, `shelf ${a} holds ${signed(have)}, not ${g.v}`);
    };
  }),
  P("the word at address 8 is 0x40b50633", `the word at address (?<a>${NUM}) is (?<v>${NUM})`, (g) => {
    const a = address(g.a, 4);
    const v = word32(g.v);
    return (run) => {
      const b = bytesAt(run, a, 4);
      if (!b) return no(`address ${a} is outside memory`);
      const have = new DataView(b.buffer, b.byteOffset, 4).getUint32(0, true);
      return pass(have === v, `the word at ${a} is ${hex(have)}`, `the word at ${a} is ${hex(have)}, not ${hex(v)}`);
    };
  }),
  P("the pixel at row 1 column 2 is color 3", `the pixel at row (?<r>${NUM}) column (?<c>${NUM}) is colou?r (?<v>${NUM})`, (g) => {
    const r = num(g.r);
    const c = num(g.c);
    const v = num(g.v);
    if (!Number.isInteger(r) || r < 0 || r > 15) throw new PhraseError("row must be 0 to 15");
    if (!Number.isInteger(c) || c < 0 || c > 15) throw new PhraseError("column must be 0 to 15");
    if (!Number.isInteger(v) || v < 0 || v > 15) throw new PhraseError("color must be 0 to 15");
    return (run) => {
      const have = run.machine.readMem(PIXEL_BASE + r * 16 + c, 1)[0]!;
      return pass(have === v, `the pixel at row ${r} column ${c} is color ${have}`, `the pixel at row ${r} column ${c} is color ${have}, not ${v}`);
    };
  }),
  P("at least 5 pixels are lit", `at least (?<n>${NUM}) pixels? (?:are|is) lit`, (g) => {
    const n = count(g.n!, 1);
    if (n > PIXEL_COUNT) throw new PhraseError(`the screen has only ${PIXEL_COUNT} pixels`);
    return (run) => {
      const lit = run.machine.readMem(PIXEL_BASE, PIXEL_COUNT).filter((b) => b !== 0).length;
      return pass(lit >= n, `${lit} pixels are lit`, `only ${lit} pixels are lit`);
    };
  }),
  P("bytes 1024 to 1039 are all non-zero", `bytes (?<a>${NUM}) to (?<b>${NUM}) are all non-zero`, (g) => {
    const a = address(g.a);
    const b = address(g.b);
    if (b < a) throw new PhraseError("the first address must not be after the last (wrong order)");
    return (run) => {
      const bytes = bytesAt(run, a, b - a + 1);
      if (!bytes) return no(`addresses ${a} to ${b} are outside memory`);
      const zero = bytes.findIndex((x) => x === 0);
      return pass(zero < 0, `bytes ${a} to ${b} are all non-zero`, `the byte at ${a + zero} is zero`);
    };
  }),
  P("the program has at most 4 cards", `the program has at most (?<n>${NUM}) cards?`, (g) => {
    const n = count(g.n!, 1);
    return (run) => pass(run.cards <= n, `${plural(run.cards, "card", "cards")}`, `the program has ${plural(run.cards, "card", "cards")}`);
  }),
  P("the program has 3 cards", `the program has (?<n>${NUM}) cards?`, (g) => {
    const n = count(g.n!, 0);
    return (run) => pass(run.cards === n, `${plural(run.cards, "card", "cards")}`, `the program has ${plural(run.cards, "card", "cards")}`);
  }),
  P("the program ran at most 4 steps", `the program ran at most (?<n>${NUM}) steps?`, (g) => {
    const n = count(g.n!, 1);
    return (run) => pass(run.steps <= n, `${plural(run.steps, "step", "steps")}`, `the program ran ${plural(run.steps, "step", "steps")}`);
  }),
  P("the program uses only the cards: addi, add, ebreak", "the program uses only the cards: (?<list>.+)", (g) => {
    const allowed = new Set(mnemonics(g.list));
    return (run) => {
      const used = new Set([...mnemonicsOf(run.words), ...run.executed]);
      const bad = [...used].filter((m) => !allowed.has(m)).sort();
      return pass(bad.length === 0, "only allowed cards used", `the program also uses: ${bad.join(", ")}`);
    };
  }),
  P("the program does not use: mul, div", "the program does not use: (?<list>.+)", (g) => {
    const banned = new Set(mnemonics(g.list));
    return (run) => {
      const used = new Set([...mnemonicsOf(run.words), ...run.executed]);
      const bad = [...used].filter((m) => banned.has(m)).sort();
      return pass(bad.length === 0, "no banned cards used", `the program uses: ${bad.join(", ")}`);
    };
  }),
  P("the program differs from the starter by exactly 1 bit", `the program differs from the starter(?: by exactly (?<n>${NUM}) bits?)?`, (g) => {
    const n = g.n === undefined ? undefined : count(g.n, 0);
    return (run) => {
      if (!run.starter) return no("this lesson run has no starter program to compare with");
      let bits = 0;
      const mine = run.words.slice(0, run.cards); // the hidden end marker is not the student's
      const len = Math.max(run.starter.length, mine.length);
      for (let i = 0; i < len; i++) bits += popcount((run.starter[i] ?? 0) ^ (mine[i] ?? 0));
      if (n === undefined) return pass(bits > 0, `differs by ${plural(bits, "bit", "bits")}`, "the program is the same as the starter");
      return pass(bits === n, `differs by ${plural(bits, "bit", "bits")}`, `the program differs from the starter by ${plural(bits, "bit", "bits")}`);
    };
  }),
  P("the program ends with a Stop card", "the program ends with a Stop card", () => (run) => {
    const last = run.words.at(-1);
    const d = last === undefined ? null : decode(last);
    return pass(d?.mnemonic === "ebreak", "the last card is Stop", "the last card is not a Stop card");
  }),
  P("the loop ran 3 laps", `the loop ran (?<least>at least )?(?<n>${NUM}) laps?`, (g) => {
    const n = count(g.n!, 0);
    const least = g.least !== undefined;
    return (run) => pass(least ? run.laps >= n : run.laps === n, `the loop ran ${plural(run.laps, "lap", "laps")}`, `the loop ran ${plural(run.laps, "lap", "laps")}`);
  }),
  P('the output is "12"', `the output is (?<s>${STR})`, (g) => {
    const want = str(g.s);
    return (run) => pass(run.output === want, "the output matches", `the output was ${JSON.stringify(run.output)}`);
  }),
  P('the student\'s first prediction for "a2" was 12', `the student[’']s first prediction for (?<t>${STR}) was (?<v>${NUM})`, (g) => {
    const target = str(g.t);
    const want = num(g.v);
    return (run) => {
      const first = run.predictions[target]?.[0];
      if (first === undefined) return no(`the student made no prediction for "${target}"`);
      return pass(first === want, `the first prediction was ${first}`, `the first prediction for "${target}" was ${first}`);
    };
  }),
  P('the student has predicted "a2"', `the student has predicted (?<t>${STR})`, (g) => {
    const target = str(g.t);
    return (run) => pass((run.predictions[target]?.length ?? 0) > 0, "a prediction was made", `no prediction for "${target}" yet`);
  }),
  P("the student edited at least 2 cards", `the student edited (?:a card|at least (?<n>${NUM}) cards?)`, (g) => {
    const n = g.n === undefined ? 1 : count(g.n, 1);
    return (run) => {
      const cards = new Set(run.events.filter((e) => e.type === "edit").map((e) => (e as { card: number }).card));
      return pass(cards.size >= n, `${plural(cards.size, "card", "cards")} edited`, `only ${plural(cards.size, "card", "cards")} edited`);
    };
  }),
  P("the student toggled at least 1 bit", `the student toggled at least (?<n>${NUM}) bits?`, (g) => {
    const n = count(g.n!, 1);
    return (run) => {
      const bits = run.events.filter((e) => e.type === "toggle").length;
      return pass(bits >= n, `${plural(bits, "bit", "bits")} toggled`, `only ${plural(bits, "bit", "bits")} toggled`);
    };
  }),
  P("the student rewound", "the student rewound", () => (run) => pass(run.events.some((e) => e.type === "rewind"), "the student rewound", "the student has not rewound")),
  P("the timeline is at step 1", `the timeline is at step (?<n>${NUM})`, (g) => {
    const n = count(g.n!, 0);
    return (run) => pass(run.position === n, `the timeline is at step ${n}`, `the timeline is at step ${run.position ?? "unknown"}`);
  }),
  P("the program counter is 4", `the program counter is (?<a>${NUM})`, (g) => {
    const a = address(g.a, 4);
    return (run) => pass(run.machine.pc === a, `the program counter is ${a}`, `the program counter is ${run.machine.pc}`);
  }),
];

function distance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j]!;
      prev[j] = Math.min(up + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length]!;
}

/** The closest known phrases (by example text) to what was typed. */
export function closeMatches(text: string, limit = 3): string[] {
  const t = text.toLowerCase();
  return PHRASES.map((p) => ({ e: p.example, d: distance(t, p.example.toLowerCase()) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, limit)
    .map((x) => x.e);
}

const KEYWORD = /^(?:Given|When|Then|And|But)\s+/;

/**
 * Turn a phrase into a check. Leading Gherkin keywords are ignored so a step line and an `until:`
 * entry share one vocabulary. Unknown phrases return an error listing the close matches.
 */
export function parseStep(text: string): ParsedStep {
  const phrase = text.replace(KEYWORD, "").trim().replace(/\s+/g, " ");
  if (phrase === "") return { ok: false, error: "empty step phrase", suggestions: [] };
  for (const p of PHRASES) {
    const m = p.pattern.exec(phrase);
    if (!m) continue;
    try {
      const fn = p.make({ ...m.groups });
      return {
        ok: true,
        id: p.example,
        fn: (run) => {
          const r = fn(run);
          return { ok: r.ok, message: r.message };
        },
      };
    } catch (e) {
      if (e instanceof PhraseError) return { ok: false, error: `bad step "${phrase}": ${e.message}`, suggestions: [] };
      throw e;
    }
  }
  const suggestions = closeMatches(phrase);
  return { ok: false, error: `unknown step "${phrase}". Close matches: ${suggestions.map((s) => `"${s}"`).join("; ")}`, suggestions };
}

/** Every known phrase, as examples (for documentation and error messages). */
export function knownPhrases(): string[] {
  return PHRASES.map((p) => p.example);
}
