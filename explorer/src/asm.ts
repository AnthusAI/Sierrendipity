export interface AsmError {
  line: number;
  column: number;
  message: string;
}

export interface AsmResult {
  words: number[];
  listing: { line: number; addr: number; word: number }[];
  labels: Record<string, number>;
  errors: AsmError[];
}

const ABI_NAMES = [
  "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
  "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6",
];
const REGISTERS = new Map<string, number>();
ABI_NAMES.forEach((name, n) => {
  REGISTERS.set(name, n);
  REGISTERS.set(`x${n}`, n);
});
REGISTERS.set("fp", 8);

// name -> [funct7, funct3]
const R_OPS: Record<string, [number, number]> = {
  add: [0, 0], sub: [0x20, 0], sll: [0, 1], slt: [0, 2], sltu: [0, 3], xor: [0, 4], srl: [0, 5], sra: [0x20, 5],
  or: [0, 6], and: [0, 7],
  mul: [1, 0], mulh: [1, 1], mulhsu: [1, 2], mulhu: [1, 3], div: [1, 4], divu: [1, 5], rem: [1, 6], remu: [1, 7],
};
const I_OPS: Record<string, number> = { addi: 0, slti: 2, sltiu: 3, xori: 4, ori: 6, andi: 7 };
const SHIFT_OPS: Record<string, [number, number]> = { slli: [0, 1], srli: [0, 5], srai: [0x20, 5] };
const LOAD_OPS: Record<string, number> = { lb: 0, lh: 1, lw: 2, lbu: 4, lhu: 5 };
const STORE_OPS: Record<string, number> = { sb: 0, sh: 1, sw: 2 };
const BRANCH_OPS: Record<string, number> = { beq: 0, bne: 1, blt: 4, bge: 5, bltu: 6, bgeu: 7 };

const IGNORED_DIRECTIVES = new Set([".text", ".globl", ".global"]);
const FILE_DIRECTIVES = new Set([".incbin", ".include"]);

interface Operand {
  text: string;
  column: number;
}

interface Statement {
  line: number;
  column: number;
  mnemonic: string;
  operands: Operand[];
  addr: number;
}

/** Thrown inside encoding to report one error for the statement being assembled. */
class AsmFailure extends Error {
  constructor(public column: number, message: string) {
    super(message);
  }
}

const rType = (f7: number, f3: number, rd: number, rs1: number, rs2: number, op = 0x33): number =>
  ((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0;
const iType = (imm: number, f3: number, rd: number, rs1: number, op: number): number =>
  (((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0;
const sType = (imm: number, f3: number, rs1: number, rs2: number): number =>
  ((((imm >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | ((imm & 0x1f) << 7) | 0x23) >>> 0;
const bType = (imm: number, f3: number, rs1: number, rs2: number): number =>
  ((((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) |
    (((imm >> 1) & 0xf) << 8) | (((imm >> 11) & 1) << 7) | 0x63) >>> 0;
const uType = (imm20: number, rd: number, op: number): number => (((imm20 & 0xfffff) << 12) | (rd << 7) | op) >>> 0;
const jType = (imm: number, rd: number): number =>
  ((((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20) | (((imm >> 12) & 0xff) << 12) |
    (rd << 7) | 0x6f) >>> 0;

const NUMBER = /^[+-]?(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)$/;
const parseNumber = (text: string): number | null => {
  if (!NUMBER.test(text)) return null;
  const negative = text.startsWith("-");
  const digits = text.replace(/^[+-]/, "");
  const magnitude = /^0[bB]/.test(digits) ? parseInt(digits.slice(2), 2) : Number(digits);
  return negative ? -magnitude : magnitude;
};

/** Table lookup that ignores inherited keys such as "constructor". */
const own = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

const plural = (n: number): string => `${n} operand${n === 1 ? "" : "s"}`;

/** The words that load a 32-bit constant: addi alone when it fits, else lui plus addi with the carry fix. */
function liWords(rd: number, value: number): number[] {
  const s = value | 0;
  if (s >= -2048 && s <= 2047) return [iType(s, 0, rd, 0, 0x13)];
  const lo = (s << 20) >> 20; // sign-extended low 12 bits; addi adds this, so bit 11 carries into the upper part
  const words = [uType((s - lo) >>> 12, rd, 0x37)];
  if (lo !== 0) words.push(iType(lo, 0, rd, rd, 0x13));
  return words;
}

export function assemble(source: string, opts: { base?: number } = {}): AsmResult {
  const base = opts.base ?? 0;
  const errors: AsmError[] = [];
  const labels: Record<string, number> = Object.create(null);
  const statements: Statement[] = [];
  const fail = (line: number, column: number, message: string) => errors.push({ line, column, message });

  // Pass 1: split lines into labels and statements, and assign addresses.
  let addr = base;
  source.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    let text = raw;
    const comment = text.search(/#|\/\//);
    if (comment >= 0) text = text.slice(0, comment);
    let pos = 0;
    for (;;) {
      const m = /^(\s*)([A-Za-z_.$][\w.$]*):/.exec(text.slice(pos));
      if (!m) break;
      const name = m[2]!;
      if (name in labels) fail(line, pos + m[1]!.length + 1, `label '${name}' is already defined`);
      else labels[name] = addr;
      pos += m[0].length;
    }
    const stmt = /^(\s*)(\S+)(.*)$/.exec(text.slice(pos));
    if (!stmt) return;
    const column = pos + stmt[1]!.length + 1;
    const mnemonic = stmt[2]!;
    const operands: Operand[] = [];
    let offset = pos + stmt[1]!.length + mnemonic.length;
    if (stmt[3]!.trim() !== "") {
      for (const piece of stmt[3]!.split(",")) {
        const lead = piece.length - piece.trimStart().length;
        operands.push({ text: piece.trim(), column: offset + lead + 1 });
        offset += piece.length + 1;
      }
    }
    const statement: Statement = { line, column, mnemonic, operands, addr };
    statements.push(statement);
    addr += 4 * sizeInWords(statement);
  });

  // Pass 2: encode.
  const words: number[] = [];
  const listing: AsmResult["listing"] = [];
  for (const st of statements) {
    try {
      let at = st.addr;
      for (const word of encode(st, labels)) {
        words.push(word);
        listing.push({ line: st.line, addr: at, word });
        at += 4;
      }
    } catch (e) {
      if (!(e instanceof AsmFailure)) throw e;
      fail(st.line, e.column, e.message);
    }
  }

  errors.sort((a, b) => a.line - b.line || a.column - b.column);
  return errors.length > 0 ? { words: [], listing: [], labels, errors } : { words, listing, labels, errors };
}

function sizeInWords(st: Statement): number {
  if (st.mnemonic === ".word") return Math.max(st.operands.length, 1);
  if (st.mnemonic.startsWith(".")) return 0;
  if (st.mnemonic === "li" && st.operands.length === 2) {
    const value = parseNumber(st.operands[1]!.text);
    if (value !== null && value >= -2147483648 && value <= 4294967295) return liWords(0, value).length;
  }
  return 1;
}

function encode(st: Statement, labels: Record<string, number>): number[] {
  const { mnemonic: m, operands: ops } = st;

  const expect = (min: number, max = min) => {
    if (ops.length < min || ops.length > max) {
      const want = min === max ? plural(min) : `${min} or ${plural(max)}`;
      throw new AsmFailure(st.column, `${m} expects ${want} but found ${ops.length}`);
    }
  };
  const reg = (op: Operand | undefined): number => {
    const n = REGISTERS.get(op!.text);
    if (n === undefined) throw new AsmFailure(op!.column, `bad register '${op!.text}'`);
    return n;
  };
  const num = (op: Operand): number => {
    const v = parseNumber(op.text);
    if (v === null) throw new AsmFailure(op.column, `bad number '${op.text}'`);
    return v;
  };
  const imm12 = (op: Operand): number => {
    const v = num(op);
    if (v < -2048 || v > 2047) throw new AsmFailure(op.column, `immediate ${v} out of range (-2048 to 2047)`);
    return v;
  };
  /** `offset(register)`, with the offset optional. */
  const memory = (op: Operand): { offset: number; base: number } => {
    const match = /^(.*)\((.*)\)$/.exec(op.text);
    if (!match) throw new AsmFailure(op.column, `expected offset(register) but found '${op.text}'`);
    const offsetText = match[1]!.trim();
    const offset = offsetText === "" ? 0 : imm12({ text: offsetText, column: op.column });
    const registerText = match[2]!.trim();
    const registerColumn = op.column + op.text.indexOf("(") + 1 + (match[2]!.length - match[2]!.trimStart().length);
    return { offset, base: reg({ text: registerText, column: registerColumn }) };
  };
  /** A number is a relative offset already; a name is a label. */
  const target = (op: Operand): number => {
    const literal = parseNumber(op.text);
    if (literal !== null) return literal;
    const at = labels[op.text];
    if (at === undefined) throw new AsmFailure(op.column, `undefined label '${op.text}'`);
    return at - st.addr;
  };
  const branchOffset = (op: Operand): number => {
    const v = target(op);
    if (v < -4096 || v > 4094) throw new AsmFailure(op.column, `branch offset ${v} out of range (-4096 to 4094)`);
    if (v % 2 !== 0) throw new AsmFailure(op.column, `branch offset ${v} must be even`);
    return v;
  };
  const jumpOffset = (op: Operand): number => {
    const v = target(op);
    if (v < -1048576 || v > 1048574) throw new AsmFailure(op.column, `jump offset ${v} out of range (-1048576 to 1048574)`);
    if (v % 2 !== 0) throw new AsmFailure(op.column, `jump offset ${v} must be even`);
    return v;
  };

  if (m.startsWith(".")) {
    if (IGNORED_DIRECTIVES.has(m)) return [];
    if (FILE_DIRECTIVES.has(m)) {
      throw new AsmFailure(st.column, `directive '${m}' is not supported: the assembler never reads files`);
    }
    if (m === ".word") {
      if (ops.length === 0) throw new AsmFailure(st.column, ".word expects a number");
      return ops.map((op) => {
        const v = num(op);
        if (v < -2147483648 || v > 4294967295) {
          throw new AsmFailure(op.column, `immediate ${v} out of range (-2147483648 to 4294967295)`);
        }
        return v >>> 0;
      });
    }
    throw new AsmFailure(st.column, `unknown directive '${m}'`);
  }

  const rOp = own(R_OPS, m);
  if (rOp) {
    expect(3);
    return [rType(rOp[0], rOp[1], reg(ops[0]), reg(ops[1]), reg(ops[2]))];
  }
  const iOp = own(I_OPS, m);
  if (iOp !== undefined) {
    expect(3);
    return [iType(imm12(ops[2]!), iOp, reg(ops[0]), reg(ops[1]), 0x13)];
  }
  const shift = own(SHIFT_OPS, m);
  if (shift) {
    expect(3);
    const rd = reg(ops[0]);
    const rs1 = reg(ops[1]);
    const v = num(ops[2]!);
    if (v < 0 || v > 31) throw new AsmFailure(ops[2]!.column, `shift amount ${v} out of range (0 to 31)`);
    return [iType((shift[0] << 5) | v, shift[1], rd, rs1, 0x13)];
  }
  const load = own(LOAD_OPS, m);
  if (load !== undefined) {
    expect(2);
    const rd = reg(ops[0]);
    const mem = memory(ops[1]!);
    return [iType(mem.offset, load, rd, mem.base, 0x03)];
  }
  const store = own(STORE_OPS, m);
  if (store !== undefined) {
    expect(2);
    const rs2 = reg(ops[0]);
    const mem = memory(ops[1]!);
    return [sType(mem.offset, store, mem.base, rs2)];
  }
  const branch = own(BRANCH_OPS, m);
  if (branch !== undefined) {
    expect(3);
    return [bType(branchOffset(ops[2]!), branch, reg(ops[0]), reg(ops[1]))];
  }

  switch (m) {
    case "lui":
    case "auipc": {
      expect(2);
      const rd = reg(ops[0]);
      const v = num(ops[1]!);
      if (v < -524288 || v > 1048575) throw new AsmFailure(ops[1]!.column, `immediate ${v} out of range (-524288 to 1048575)`);
      return [uType(v, rd, m === "lui" ? 0x37 : 0x17)];
    }
    case "jal":
      expect(1, 2);
      return [jType(jumpOffset(ops[ops.length - 1]!), ops.length === 2 ? reg(ops[0]) : 1)];
    case "jalr": {
      expect(1, 2);
      if (ops.length === 1) return [iType(0, 0, 1, reg(ops[0]), 0x67)];
      const rd = reg(ops[0]);
      const mem = memory(ops[1]!);
      return [iType(mem.offset, 0, rd, mem.base, 0x67)];
    }
    case "ecall":
      expect(0);
      return [0x73];
    case "ebreak":
      expect(0);
      return [0x100073];
    case "nop":
      expect(0);
      return [0x13];
    case "mv":
      expect(2);
      return [iType(0, 0, reg(ops[0]), reg(ops[1]), 0x13)];
    case "li": {
      expect(2);
      const rd = reg(ops[0]);
      const v = num(ops[1]!);
      if (v < -2147483648 || v > 4294967295) {
        throw new AsmFailure(ops[1]!.column, `immediate ${v} out of range (-2147483648 to 4294967295)`);
      }
      return liWords(rd, v);
    }
    case "j":
      expect(1);
      return [jType(jumpOffset(ops[0]!), 0)];
    case "jr":
      expect(1);
      return [iType(0, 0, 0, reg(ops[0]), 0x67)];
    case "ret":
      expect(0);
      return [iType(0, 0, 0, 1, 0x67)];
    case "call":
      expect(1);
      return [jType(jumpOffset(ops[0]!), 1)];
    default:
      throw new AsmFailure(st.column, `unknown mnemonic '${m}'`);
  }
}
