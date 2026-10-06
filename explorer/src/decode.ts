export type InstrFormat = "R" | "I" | "S" | "B" | "U" | "J";

/** One run of bits in an instruction word. hi and lo are inclusive bit positions. */
export interface Field {
  name: string;
  hi: number;
  lo: number;
  value: number;
  label: string;
}

export interface Decoded {
  word: number;
  format: InstrFormat;
  mnemonic: string;
  operands: string;
  text: string;
  fields: Field[];
}

const ABI_NAMES = [
  "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
  "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6",
];

export function registerName(n: number): string {
  return ABI_NAMES[n] ?? `x${n}`;
}

// funct7:funct3 -> mnemonic for opcode 0x33 (RV32I plus the M extension).
const R_OPS: Record<string, string> = {
  "0:0": "add", "32:0": "sub", "0:1": "sll", "0:2": "slt", "0:3": "sltu", "0:4": "xor",
  "0:5": "srl", "32:5": "sra", "0:6": "or", "0:7": "and",
  "1:0": "mul", "1:1": "mulh", "1:2": "mulhsu", "1:3": "mulhu",
  "1:4": "div", "1:5": "divu", "1:6": "rem", "1:7": "remu",
};
const I_OPS: Record<number, string> = { 0: "addi", 2: "slti", 3: "sltiu", 4: "xori", 6: "ori", 7: "andi" };
const LOAD_OPS: Record<number, string> = { 0: "lb", 1: "lh", 2: "lw", 4: "lbu", 5: "lhu" };
const STORE_OPS: Record<number, string> = { 0: "sb", 1: "sh", 2: "sw" };
const BRANCH_OPS: Record<number, string> = { 0: "beq", 1: "bne", 4: "blt", 5: "bge", 6: "bltu", 7: "bgeu" };

/** Sign-extend the low `bits` bits of v. */
const sext = (v: number, bits: number): number => (v << (32 - bits)) >> (32 - bits);
const bits = (w: number, hi: number, lo: number): number => (w >>> lo) & (2 ** (hi - lo + 1) - 1);

export function decode(word: number, opts: { aliases?: boolean } = {}): Decoded | null {
  const w = word >>> 0;
  if ((w & 3) !== 3) return null; // 32-bit encodings only; no compressed instructions
  const rd = bits(w, 11, 7);
  const rs1 = bits(w, 19, 15);
  const rs2 = bits(w, 24, 20);
  const f3 = bits(w, 14, 12);
  const f7 = bits(w, 31, 25);

  const plain = (name: string, hi: number, lo: number, label = `${name} = ${bits(w, hi, lo)}`): Field => ({
    name, hi, lo, value: bits(w, hi, lo), label,
  });
  const reg = (name: string, hi: number, lo: number): Field => {
    const n = bits(w, hi, lo);
    return plain(name, hi, lo, `${name} = ${registerName(n)} (x${n})`);
  };
  const funct3 = () => plain("funct3", 14, 12);
  const opcode = () => plain("opcode", 6, 0, `opcode = 0x${(w & 0x7f).toString(16)}`);
  /** The pieces of a scattered immediate: [hi, lo, "bit range within the immediate"]. */
  const imm = (value: number, pieces: [number, number, string][]): Field[] =>
    pieces.map(([hi, lo, range]) => plain("imm", hi, lo, `imm = ${value} (${range})`));

  const make = (format: InstrFormat, mnemonic: string, operands: string, fields: Field[]): Decoded => {
    fields.sort((a, b) => b.hi - a.hi);
    return { word: w, format, mnemonic, operands, text: operands ? `${mnemonic} ${operands}` : mnemonic, fields };
  };
  const [rdN, rs1N, rs2N] = [registerName(rd), registerName(rs1), registerName(rs2)];

  switch (w & 0x7f) {
    case 0x33: {
      const m = R_OPS[`${f7}:${f3}`];
      if (!m) return null;
      return make("R", m, `${rdN}, ${rs1N}, ${rs2N}`, [
        plain("funct7", 31, 25, `funct7 = 0x${f7.toString(16)}`), reg("rs2", 24, 20), reg("rs1", 19, 15),
        funct3(), reg("rd", 11, 7), opcode(),
      ]);
    }
    case 0x13: {
      const iFields = (...first: Field[]) => [...first, reg("rs1", 19, 15), funct3(), reg("rd", 11, 7), opcode()];
      if (f3 === 1 || f3 === 5) {
        const m = f3 === 1 ? (f7 === 0 ? "slli" : null) : f7 === 0 ? "srli" : f7 === 32 ? "srai" : null;
        if (!m) return null;
        return make("I", m, `${rdN}, ${rs1N}, ${rs2}`, iFields(
          plain("funct7", 31, 25, `funct7 = 0x${f7.toString(16)}`), plain("shamt", 24, 20),
        ));
      }
      const v = sext(w >>> 20, 12);
      const m = I_OPS[f3];
      if (opts.aliases) {
        if (w === 0x13) return make("I", "nop", "", iFields(plain("imm", 31, 20, `imm = ${v}`)));
        if (f3 === 0 && rs1 === 0) return make("I", "li", `${rdN}, ${v}`, iFields(plain("imm", 31, 20, `imm = ${v}`)));
        if (f3 === 0 && v === 0) return make("I", "mv", `${rdN}, ${rs1N}`, iFields(plain("imm", 31, 20, `imm = ${v}`)));
      }
      return make("I", m, `${rdN}, ${rs1N}, ${v}`, iFields(plain("imm", 31, 20, `imm = ${v}`)));
    }
    case 0x03: {
      const m = LOAD_OPS[f3];
      if (!m) return null;
      const v = sext(w >>> 20, 12);
      return make("I", m, `${rdN}, ${v}(${rs1N})`, [
        plain("imm", 31, 20, `imm = ${v}`), reg("rs1", 19, 15), funct3(), reg("rd", 11, 7), opcode(),
      ]);
    }
    case 0x67: {
      if (f3 !== 0) return null;
      const v = sext(w >>> 20, 12);
      const fields = [plain("imm", 31, 20, `imm = ${v}`), reg("rs1", 19, 15), funct3(), reg("rd", 11, 7), opcode()];
      if (opts.aliases && rd === 0 && v === 0) {
        return make("I", rs1 === 1 ? "ret" : "jr", rs1 === 1 ? "" : rs1N, fields);
      }
      return make("I", "jalr", `${rdN}, ${v}(${rs1N})`, fields);
    }
    case 0x0f: {
      if (w !== 0x0ff0000f) return null; // only the plain `fence iorw, iorw`
      return make("I", "fence", "", [
        plain("imm", 31, 20, `imm = ${bits(w, 31, 20)}`), reg("rs1", 19, 15), funct3(), reg("rd", 11, 7), opcode(),
      ]);
    }
    case 0x73: {
      if (w !== 0x73 && w !== 0x100073) return null;
      return make("I", w === 0x73 ? "ecall" : "ebreak", "", [
        plain("imm", 31, 20, `imm = ${bits(w, 31, 20)}`), reg("rs1", 19, 15), funct3(), reg("rd", 11, 7), opcode(),
      ]);
    }
    case 0x23: {
      const m = STORE_OPS[f3];
      if (!m) return null;
      const v = sext((f7 << 5) | rd, 12);
      return make("S", m, `${rs2N}, ${v}(${rs1N})`, [
        ...imm(v, [[31, 25, "bits 11:5"], [11, 7, "bits 4:0"]]),
        reg("rs2", 24, 20), reg("rs1", 19, 15), funct3(), opcode(),
      ]);
    }
    case 0x63: {
      const m = BRANCH_OPS[f3];
      if (!m) return null;
      const v = sext((bits(w, 31, 31) << 12) | (bits(w, 7, 7) << 11) | (bits(w, 30, 25) << 5) | (bits(w, 11, 8) << 1), 13);
      return make("B", m, `${rs1N}, ${rs2N}, ${v}`, [
        ...imm(v, [[31, 31, "bit 12"], [30, 25, "bits 10:5"], [11, 8, "bits 4:1"], [7, 7, "bit 11"]]),
        reg("rs2", 24, 20), reg("rs1", 19, 15), funct3(), opcode(),
      ]);
    }
    case 0x37:
    case 0x17: {
      const top = w >>> 12;
      return make("U", (w & 0x7f) === 0x37 ? "lui" : "auipc", `${rdN}, 0x${top.toString(16)}`, [
        plain("imm", 31, 12, `imm = 0x${top.toString(16)}`), reg("rd", 11, 7), opcode(),
      ]);
    }
    case 0x6f: {
      const v = sext((bits(w, 31, 31) << 20) | (bits(w, 19, 12) << 12) | (bits(w, 20, 20) << 11) | (bits(w, 30, 21) << 1), 21);
      const fields = [
        ...imm(v, [[31, 31, "bit 20"], [30, 21, "bits 10:1"], [20, 20, "bit 11"], [19, 12, "bits 19:12"]]),
        reg("rd", 11, 7), opcode(),
      ];
      if (opts.aliases && rd === 0) return make("J", "j", `${v}`, fields);
      return make("J", "jal", `${rdN}, ${v}`, fields);
    }
    default:
      return null;
  }
}
