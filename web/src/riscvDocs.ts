import { registerName } from "@sierrendipity/explorer";

/** One-line documentation for the RV32IM instructions: mnemonic -> [format, description]. */
export const INSTRUCTIONS: Record<string, [string, string]> = {
  lui: ["U", "Load upper immediate: rd = imm << 12"],
  auipc: ["U", "Add upper immediate to pc: rd = pc + (imm << 12)"],
  jal: ["J", "Jump and link: rd = pc + 4; pc += offset"],
  jalr: ["I", "Jump and link register: rd = pc + 4; pc = rs1 + imm"],
  beq: ["B", "Branch if rs1 == rs2"],
  bne: ["B", "Branch if rs1 != rs2"],
  blt: ["B", "Branch if rs1 < rs2 (signed)"],
  bge: ["B", "Branch if rs1 >= rs2 (signed)"],
  bltu: ["B", "Branch if rs1 < rs2 (unsigned)"],
  bgeu: ["B", "Branch if rs1 >= rs2 (unsigned)"],
  lb: ["I", "Load byte, sign-extended: rd = mem8[rs1 + imm]"],
  lh: ["I", "Load halfword, sign-extended: rd = mem16[rs1 + imm]"],
  lw: ["I", "Load word: rd = mem32[rs1 + imm]"],
  lbu: ["I", "Load byte, zero-extended"],
  lhu: ["I", "Load halfword, zero-extended"],
  sb: ["S", "Store byte: mem8[rs1 + imm] = rs2"],
  sh: ["S", "Store halfword: mem16[rs1 + imm] = rs2"],
  sw: ["S", "Store word: mem32[rs1 + imm] = rs2"],
  addi: ["I", "Add immediate: rd = rs1 + imm"],
  slti: ["I", "Set rd to 1 if rs1 < imm (signed), else 0"],
  sltiu: ["I", "Set rd to 1 if rs1 < imm (unsigned), else 0"],
  xori: ["I", "Bitwise exclusive or with immediate"],
  ori: ["I", "Bitwise or with immediate"],
  andi: ["I", "Bitwise and with immediate"],
  slli: ["I", "Shift left logical by immediate"],
  srli: ["I", "Shift right logical by immediate"],
  srai: ["I", "Shift right arithmetic by immediate"],
  add: ["R", "Add: rd = rs1 + rs2"],
  sub: ["R", "Subtract: rd = rs1 - rs2"],
  sll: ["R", "Shift left logical by rs2"],
  slt: ["R", "Set rd to 1 if rs1 < rs2 (signed), else 0"],
  sltu: ["R", "Set rd to 1 if rs1 < rs2 (unsigned), else 0"],
  xor: ["R", "Bitwise exclusive or"],
  srl: ["R", "Shift right logical by rs2"],
  sra: ["R", "Shift right arithmetic by rs2"],
  or: ["R", "Bitwise or"],
  and: ["R", "Bitwise and"],
  mul: ["R", "Multiply: rd = low 32 bits of rs1 * rs2"],
  mulh: ["R", "Multiply, high 32 bits (signed x signed)"],
  mulhsu: ["R", "Multiply, high 32 bits (signed x unsigned)"],
  mulhu: ["R", "Multiply, high 32 bits (unsigned x unsigned)"],
  div: ["R", "Divide (signed): rd = rs1 / rs2"],
  divu: ["R", "Divide (unsigned)"],
  rem: ["R", "Remainder (signed)"],
  remu: ["R", "Remainder (unsigned)"],
  ecall: ["I", "Environment call: a7 selects the call (64 write, 63 read, 93 exit)"],
  ebreak: ["I", "Breakpoint: stops the program"],
  // Pseudo-instructions
  li: ["pseudo", "Load immediate: rd = imm (expands to addi or lui + addi)"],
  jr: ["pseudo", "Jump to the address in a register (jalr zero, 0(rs))"],
  fence: ["I", "Memory ordering fence (does nothing in this emulator)"],
  mv: ["pseudo", "Copy register: rd = rs (addi rd, rs, 0)"],
  nop: ["pseudo", "Do nothing (addi zero, zero, 0)"],
  j: ["pseudo", "Jump to a label (jal zero, label)"],
  ret: ["pseudo", "Return to the caller (jalr zero, 0(ra))"],
  call: ["pseudo", "Call a function (jal ra, label)"],
};

const ROLES: Record<string, string> = {
  zero: "hard-wired zero",
  ra: "return address",
  sp: "stack pointer",
  gp: "global pointer",
  tp: "thread pointer",
  fp: "frame pointer (same as s0)",
};

/** Hover text for a register name such as "a0", "sp" or "x10", or undefined if it is not one. */
export function registerDoc(name: string): string | undefined {
  const x = /^x(\d+)$/.exec(name);
  const number = x ? Number(x[1]) : name === "fp" ? 8 : Array.from({ length: 32 }, (_, i) => registerName(i)).indexOf(name);
  if (number < 0 || number > 31) return undefined;
  const abi = registerName(number);
  const role =
    ROLES[abi] ??
    (abi.startsWith("a") ? "argument / return value" : abi.startsWith("s") ? "saved register" : "temporary register");
  return `**${abi}** (x${number}): ${role}`;
}

export function instructionDoc(mnemonic: string): string | undefined {
  const entry = INSTRUCTIONS[mnemonic.toLowerCase()];
  return entry && `**${mnemonic}** (${entry[0] === "pseudo" ? "pseudo-instruction" : `${entry[0]}-type`}): ${entry[1]}`;
}
