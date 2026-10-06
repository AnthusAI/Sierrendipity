// RV32I base integer instruction set: shared tables for the decoder, encoder, assembler and machine.
export type Format = "R" | "I" | "S" | "B" | "U" | "J";

export interface Spec {
  fmt: Format;
  opcode: number;
  funct3?: number;
  funct7?: number;
  /** I-format shifts carry funct7 in the immediate's upper bits. */
  shift?: boolean;
  /** Fixed 12-bit immediate (ecall/ebreak). */
  fixedImm?: number;
  kind?: "load" | "jalr" | "system";
}

export const SPECS: Record<string, Spec> = {
  lui: { fmt: "U", opcode: 0x37 },
  auipc: { fmt: "U", opcode: 0x17 },
  jal: { fmt: "J", opcode: 0x6f },
  jalr: { fmt: "I", opcode: 0x67, funct3: 0, kind: "jalr" },
  beq: { fmt: "B", opcode: 0x63, funct3: 0 },
  bne: { fmt: "B", opcode: 0x63, funct3: 1 },
  blt: { fmt: "B", opcode: 0x63, funct3: 4 },
  bge: { fmt: "B", opcode: 0x63, funct3: 5 },
  bltu: { fmt: "B", opcode: 0x63, funct3: 6 },
  bgeu: { fmt: "B", opcode: 0x63, funct3: 7 },
  lb: { fmt: "I", opcode: 0x03, funct3: 0, kind: "load" },
  lh: { fmt: "I", opcode: 0x03, funct3: 1, kind: "load" },
  lw: { fmt: "I", opcode: 0x03, funct3: 2, kind: "load" },
  lbu: { fmt: "I", opcode: 0x03, funct3: 4, kind: "load" },
  lhu: { fmt: "I", opcode: 0x03, funct3: 5, kind: "load" },
  sb: { fmt: "S", opcode: 0x23, funct3: 0 },
  sh: { fmt: "S", opcode: 0x23, funct3: 1 },
  sw: { fmt: "S", opcode: 0x23, funct3: 2 },
  addi: { fmt: "I", opcode: 0x13, funct3: 0 },
  slti: { fmt: "I", opcode: 0x13, funct3: 2 },
  sltiu: { fmt: "I", opcode: 0x13, funct3: 3 },
  xori: { fmt: "I", opcode: 0x13, funct3: 4 },
  ori: { fmt: "I", opcode: 0x13, funct3: 6 },
  andi: { fmt: "I", opcode: 0x13, funct3: 7 },
  slli: { fmt: "I", opcode: 0x13, funct3: 1, funct7: 0x00, shift: true },
  srli: { fmt: "I", opcode: 0x13, funct3: 5, funct7: 0x00, shift: true },
  srai: { fmt: "I", opcode: 0x13, funct3: 5, funct7: 0x20, shift: true },
  add: { fmt: "R", opcode: 0x33, funct3: 0, funct7: 0x00 },
  sub: { fmt: "R", opcode: 0x33, funct3: 0, funct7: 0x20 },
  sll: { fmt: "R", opcode: 0x33, funct3: 1, funct7: 0x00 },
  slt: { fmt: "R", opcode: 0x33, funct3: 2, funct7: 0x00 },
  sltu: { fmt: "R", opcode: 0x33, funct3: 3, funct7: 0x00 },
  xor: { fmt: "R", opcode: 0x33, funct3: 4, funct7: 0x00 },
  srl: { fmt: "R", opcode: 0x33, funct3: 5, funct7: 0x00 },
  sra: { fmt: "R", opcode: 0x33, funct3: 5, funct7: 0x20 },
  or: { fmt: "R", opcode: 0x33, funct3: 6, funct7: 0x00 },
  and: { fmt: "R", opcode: 0x33, funct3: 7, funct7: 0x00 },
  ecall: { fmt: "I", opcode: 0x73, funct3: 0, kind: "system", fixedImm: 0 },
  ebreak: { fmt: "I", opcode: 0x73, funct3: 0, kind: "system", fixedImm: 1 },
};

export const ABI_NAMES = [
  "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7",
  "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6",
];

export function parseRegister(name: string): number | undefined {
  if (name === "fp") return 8;
  const abi = ABI_NAMES.indexOf(name);
  if (abi >= 0) return abi;
  const m = /^x(\d+)$/.exec(name);
  if (m && Number(m[1]) < 32) return Number(m[1]);
  return undefined;
}

export interface Instruction {
  op: string;
  rd: number;
  rs1: number;
  rs2: number;
  imm: number;
}
