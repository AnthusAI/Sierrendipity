import { Instruction, SPECS, parseRegister } from "./isa.ts";
import { encode } from "./codec.ts";

export interface AssemblyError { line: number; message: string }
export interface Assembly { words: number[]; errors: AssemblyError[]; labels: Record<string, number> }

interface Item { line: number; op: string; args: string[]; address: number }

const parseNumber = (t: string): number | undefined => {
  if (!/^[-+]?(0x[0-9a-f]+|\d+)$/i.test(t)) return undefined;
  const v = Number(t.replace(/^[-+]/, ""));
  return t.startsWith("-") ? -v : v;
};

const splitImm = (v: number) => {
  const lo = (v << 20) >> 20;
  return { hi: (v - lo) | 0, lo };
};

const operandCount = (op: string): number => {
  const s = SPECS[op];
  if (s.kind === "system") return 0;
  if (s.fmt === "R" || s.fmt === "B" || (s.fmt === "I" && !s.kind)) return 3;
  return 2;
};

export function assemble(source: string): Assembly {
  const errors: AssemblyError[] = [];
  const labels: Record<string, number> = {};
  const items: Item[] = [];
  let address = 0;

  source.split("\n").forEach((raw, idx) => {
    const line = idx + 1;
    let text = raw.replace(/(#|\/\/).*$/, "").trim();
    let m: RegExpExecArray | null;
    while ((m = /^([A-Za-z_.][\w.]*):\s*/.exec(text))) {
      if (m[1] in labels) errors.push({ line, message: `duplicate label ${m[1]}` });
      labels[m[1]] = address;
      text = text.slice(m[0].length);
    }
    if (!text) return;
    const sp = text.search(/\s/);
    const op = (sp < 0 ? text : text.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? "" : text.slice(sp).trim();
    const args = rest ? rest.split(",").map((a) => a.trim()) : [];
    let size = 4;
    if (op === "li") {
      const v = parseNumber(args[1] ?? "");
      size = v !== undefined && v >= -2048 && v <= 2047 ? 4 : 8;
    }
    items.push({ line, op, args, address });
    address += size;
  });

  const words: number[] = [];
  for (const it of items) {
    const err = (message: string) => errors.push({ line: it.line, message });
    const reg = (t: string | undefined): number => {
      const r = t === undefined ? undefined : parseRegister(t);
      if (r === undefined) { err(`expected a register, got ${t ?? "nothing"}`); return 0; }
      return r;
    };
    const imm = (t: string | undefined): number => {
      const v = t === undefined ? undefined : parseNumber(t);
      if (v === undefined) { err(`expected a number, got ${t ?? "nothing"}`); return 0; }
      return v;
    };
    const target = (t: string | undefined): number => {
      if (t !== undefined && t in labels) return labels[t] - it.address;
      const n = t === undefined ? undefined : parseNumber(t);
      if (n !== undefined) return n;
      err(`unknown label ${t ?? ""}`);
      return 0;
    };
    const mem = (t: string | undefined): [number, number] => {
      const m = /^(.*)\((.+)\)$/.exec(t ?? "");
      if (!m) { err(`expected offset(register), got ${t ?? "nothing"}`); return [0, 0]; }
      return [m[1].trim() === "" ? 0 : imm(m[1].trim()), reg(m[2].trim())];
    };
    const emit = (i: Partial<Instruction> & { op: string }) => {
      const full = { rd: 0, rs1: 0, rs2: 0, imm: 0, ...i };
      const s = SPECS[full.op];
      const range = s.shift ? [0, 31] : (s.fmt === "I" || s.fmt === "S") ? [-2048, 2047]
        : s.fmt === "B" ? [-4096, 4094] : s.fmt === "J" ? [-1048576, 1048574] : undefined;
      if (range && (full.imm < range[0] || full.imm > range[1])) err(`immediate ${full.imm} out of range for ${full.op}`);
      if ((s.fmt === "B" || s.fmt === "J") && full.imm % 2) err(`${full.op} target must be even`);
      words.push(encode(full));
    };
    const want = (n: number) => {
      if (it.args.length !== n) { err(`${it.op} takes ${n} operand(s), got ${it.args.length}`); return false; }
      return true;
    };

    const spec = SPECS[it.op];
    if (spec) {
      if (!want(operandCount(it.op))) continue;
      const a = it.args;
      switch (spec.fmt) {
        case "R": emit({ op: it.op, rd: reg(a[0]), rs1: reg(a[1]), rs2: reg(a[2]) }); break;
        case "I":
          if (spec.kind === "system") emit({ op: it.op });
          else if (spec.kind) { const [o, b] = mem(a[1]); emit({ op: it.op, rd: reg(a[0]), rs1: b, imm: o }); }
          else emit({ op: it.op, rd: reg(a[0]), rs1: reg(a[1]), imm: imm(a[2]) });
          break;
        case "S": { const [o, b] = mem(a[1]); emit({ op: it.op, rs2: reg(a[0]), rs1: b, imm: o }); break; }
        case "B": emit({ op: it.op, rs1: reg(a[0]), rs2: reg(a[1]), imm: target(a[2]) }); break;
        case "U": {
          const v = imm(a[1]);
          if (v < 0 || v > 0xfffff) err(`immediate ${v} out of range for ${it.op}`);
          emit({ op: it.op, rd: reg(a[0]), imm: v << 12 });
          break;
        }
        case "J": emit({ op: it.op, rd: reg(a[0]), imm: target(a[1]) }); break;
      }
      continue;
    }

    const a = it.args;
    switch (it.op) {
      case "nop": if (want(0)) emit({ op: "addi" }); break;
      case "mv": if (want(2)) emit({ op: "addi", rd: reg(a[0]), rs1: reg(a[1]) }); break;
      case "not": if (want(2)) emit({ op: "xori", rd: reg(a[0]), rs1: reg(a[1]), imm: -1 }); break;
      case "neg": if (want(2)) emit({ op: "sub", rd: reg(a[0]), rs2: reg(a[1]) }); break;
      case "j": if (want(1)) emit({ op: "jal", rd: 0, imm: target(a[0]) }); break;
      case "jr": if (want(1)) emit({ op: "jalr", rs1: reg(a[0]) }); break;
      case "ret": if (want(0)) emit({ op: "jalr", rs1: 1 }); break;
      case "beqz": if (want(2)) emit({ op: "beq", rs1: reg(a[0]), imm: target(a[1]) }); break;
      case "bnez": if (want(2)) emit({ op: "bne", rs1: reg(a[0]), imm: target(a[1]) }); break;
      case "li": {
        if (!want(2)) break;
        const rd = reg(a[0]);
        const v = imm(a[1]) | 0;
        if (v >= -2048 && v <= 2047) emit({ op: "addi", rd, imm: v });
        else { const { hi, lo } = splitImm(v); emit({ op: "lui", rd, imm: hi }); emit({ op: "addi", rd, rs1: rd, imm: lo }); }
        break;
      }
      default: err(`unknown instruction ${it.op}`);
    }
  }
  return { words, errors, labels };
}
