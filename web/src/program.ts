import { assemble, decode, parseMachineCode, type AsmError } from "@sierrendipity/explorer";
import type { ExplainResponse } from "./backend";

/** One 32-bit word of the program, as the Assembly, Machine and Bits tabs show it. */
export interface Row {
  index: number;
  addr: number;
  word: number;
  text: string;
  /** Source file ("" for assembly and machine code, which have one file). */
  path: string;
  /** Editor line it comes from (assembly/machine code) or the C source line (compiled C); 0 = none. */
  line: number;
  runtime: boolean;
  fn: string;
}

export interface Program {
  rows: Row[];
  byAddr: Map<number, Row>;
  /** `lineKey(path, line)` -> its rows, in address order. */
  lineRows: Map<string, Row[]>;
  /** Distinct user source files, in order of first appearance. */
  paths: string[];
  image: Uint8Array;
  loadAddress: number;
  entry: number;
  stackTop: number;
  memorySize: number;
}

export const lineKey = (path: string, line: number) => `${path}:${line}`;

export const MEMORY_SIZE = 0x10000;

export const hex32 = (n: number) => `0x${(n >>> 0).toString(16).padStart(8, "0")}`;

export const wordText = (word: number) => decode(word)?.text ?? `.word ${hex32(word)}`;

export const wordBytes = (word: number) => [0, 8, 16, 24].map((s) => (word >>> s) & 0xff);

function build(rows: Row[], loadAddress: number, entry: number, memorySize: number, stackTop: number, image?: Uint8Array): Program {
  const lineRows = new Map<string, Row[]>();
  for (const row of rows) {
    if (!row.line) continue;
    const key = lineKey(row.path, row.line);
    lineRows.set(key, [...(lineRows.get(key) ?? []), row]);
  }
  return {
    rows,
    byAddr: new Map(rows.map((r) => [r.addr, r])),
    lineRows,
    paths: [...new Set(rows.filter((r) => r.line).map((r) => r.path))],
    image: image ?? Uint8Array.from(rows.flatMap((r) => wordBytes(r.word))),
    loadAddress,
    entry,
    stackTop,
    memorySize,
  };
}

const rowOf = (index: number, addr: number, word: number, line: number, fn = ""): Row => ({
  index,
  addr,
  word,
  text: wordText(word),
  path: "",
  line,
  runtime: false,
  fn,
});

export type Built = { program: Program; errors: [] } | { program?: undefined; errors: AsmError[] };

export function fromAssembly(source: string): Built {
  const result = assemble(source, { base: 0 });
  if (result.errors.length) return { errors: result.errors };
  const rows = result.listing.map((l, i) => rowOf(i, l.addr, l.word, l.line));
  return { program: build(rows, 0, 0, MEMORY_SIZE, MEMORY_SIZE), errors: [] };
}

export function fromMachineCode(source: string): Built {
  const result = parseMachineCode(source);
  if (result.errors.length) return { errors: result.errors };
  const rows = result.words.map((word, i) => rowOf(i, i * 4, word, result.lines[i] ?? 0));
  return { program: build(rows, 0, 0, MEMORY_SIZE, MEMORY_SIZE), errors: [] };
}

/** Build the program model from a successful POST /explain response. */
export function fromExplain(response: ExplainResponse): Program | undefined {
  const { program, instructions } = response;
  if (response.status !== "ok" || !program || !instructions) return undefined;
  const rows: Row[] = instructions.map((i) => ({
    index: i.index,
    addr: i.addr,
    word: i.word,
    text: wordText(i.word),
    path: i.src?.path ?? "",
    line: i.origin === "user" ? (i.src?.line ?? 0) : 0,
    runtime: i.origin === "runtime",
    fn: i.function,
  }));
  const image = Uint8Array.from(atob(program.image), (c) => c.charCodeAt(0));
  return build(rows, program.loadAddress, program.entry, program.memorySize, program.stackTop, image);
}

/** A run of consecutive rows from the same C line (or the same runtime function). */
export interface Group {
  key: string;
  path: string;
  line: number; // 0 for runtime groups
  fn: string;
  /** 1-based position among the runs of this line, and how many runs the line has. */
  part: number;
  parts: number;
  rows: Row[];
}

export function groupRows(rows: Row[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const key = row.runtime || !row.line ? `fn:${row.fn}` : `line:${row.path}:${row.line}`;
    const last = groups.at(-1);
    if (last && last.key === key) last.rows.push(row);
    else groups.push({ key, path: row.path, line: row.runtime ? 0 : row.line, fn: row.fn, part: 0, parts: 0, rows: [row] });
  }
  const seen = new Map<string, number>();
  for (const g of groups) {
    seen.set(g.key, (seen.get(g.key) ?? 0) + 1);
    g.part = seen.get(g.key)!;
  }
  for (const g of groups) g.parts = seen.get(g.key)!;
  return groups;
}
