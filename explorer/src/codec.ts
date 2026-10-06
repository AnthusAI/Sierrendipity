import { Instruction, SPECS, Spec, ABI_NAMES } from "./isa.ts";

const signExtend = (value: number, bits: number) => (value << (32 - bits)) >> (32 - bits);

export function encode(i: Instruction): number {
  const s: Spec | undefined = SPECS[i.op];
  if (!s) throw new Error(`unknown instruction ${i.op}`);
  const f3 = (s.funct3 ?? 0) << 12;
  const rd = i.rd << 7, rs1 = i.rs1 << 15, rs2 = i.rs2 << 20;
  const imm = i.imm;
  let w: number;
  switch (s.fmt) {
    case "R": w = ((s.funct7 ?? 0) << 25) | rs2 | rs1 | f3 | rd; break;
    case "I":
      if (s.shift) w = (s.funct7! << 25) | ((imm & 31) << 20) | rs1 | f3 | rd;
      else w = (((s.fixedImm ?? imm) & 0xfff) << 20) | rs1 | f3 | rd;
      break;
    case "S": w = (((imm >> 5) & 0x7f) << 25) | rs2 | rs1 | f3 | ((imm & 31) << 7); break;
    case "B":
      w = (((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | rs2 | rs1 | f3 |
        (((imm >> 1) & 0xf) << 8) | (((imm >> 11) & 1) << 7);
      break;
    case "U": w = (imm & 0xfffff000) | rd; break;
    case "J":
      w = (((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20) |
        (imm & 0xff000) | rd;
      break;
  }
  return (w | s.opcode) >>> 0;
}

/** Decodes one 32-bit word, or returns undefined if it is not a valid RV32I instruction. */
export function decode(word: number): Instruction | undefined {
  word >>>= 0;
  const opcode = word & 0x7f, funct3 = (word >> 12) & 7, funct7 = word >>> 25;
  const rd = (word >> 7) & 31, rs1 = (word >> 15) & 31, rs2 = (word >> 20) & 31;
  for (const [op, s] of Object.entries(SPECS)) {
    if (s.opcode !== opcode) continue;
    if (s.fmt !== "U" && s.fmt !== "J" && s.funct3 !== funct3) continue;
    if (s.fmt === "R" && s.funct7 !== funct7) continue;
    if (s.shift && s.funct7 !== funct7) continue;
    if (s.fixedImm !== undefined && (word >>> 20 !== s.fixedImm || rd !== 0 || rs1 !== 0)) continue;
    let imm = 0;
    switch (s.fmt) {
      case "I": imm = s.shift ? rs2 : signExtend(word >>> 20, 12); break;
      case "S": imm = signExtend((funct7 << 5) | rd, 12); break;
      case "B":
        imm = signExtend(((word >>> 31) << 12) | (((word >> 7) & 1) << 11) | (((word >> 25) & 0x3f) << 5) | (((word >> 8) & 0xf) << 1), 13);
        break;
      case "U": imm = word & 0xfffff000; break;
      case "J":
        imm = signExtend(((word >>> 31) << 20) | (((word >> 12) & 0xff) << 12) | (((word >> 20) & 1) << 11) | (((word >> 21) & 0x3ff) << 1), 21);
        break;
    }
    const hasRs2 = s.fmt === "R" || s.fmt === "S" || s.fmt === "B";
    return {
      op,
      rd: s.fmt === "S" || s.fmt === "B" ? 0 : rd,
      rs1: s.fmt === "U" || s.fmt === "J" ? 0 : rs1,
      rs2: hasRs2 ? rs2 : 0,
      imm,
    };
  }
  return undefined;
}

const reg = (n: number) => ABI_NAMES[n];

export function disassemble(i: Instruction): string {
  const s = SPECS[i.op];
  switch (s.fmt) {
    case "R": return `${i.op} ${reg(i.rd)}, ${reg(i.rs1)}, ${reg(i.rs2)}`;
    case "I":
      if (s.kind === "system") return i.op;
      if (s.kind === "load" || s.kind === "jalr") return `${i.op} ${reg(i.rd)}, ${i.imm}(${reg(i.rs1)})`;
      return `${i.op} ${reg(i.rd)}, ${reg(i.rs1)}, ${i.imm}`;
    case "S": return `${i.op} ${reg(i.rs2)}, ${i.imm}(${reg(i.rs1)})`;
    case "B": return `${i.op} ${reg(i.rs1)}, ${reg(i.rs2)}, ${i.imm}`;
    case "U": return `${i.op} ${reg(i.rd)}, 0x${(i.imm >>> 12).toString(16)}`;
    case "J": return `${i.op} ${reg(i.rd)}, ${i.imm}`;
  }
}
