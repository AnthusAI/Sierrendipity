// Steps for the @docker explorer specs. Nothing here runs unless a @docker scenario is selected.
import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { assemble, decode, Machine } from "@sierrendipity/explorer";

const IMAGE = "sierrendipity-explorer-toolchain";
const SLOW = { timeout: 30 * 60 * 1000 };
const AS = "riscv64-unknown-elf-as -march=rv32im -mabi=ilp32";

function docker(args: string[], input?: string): string {
  const run = spawnSync("docker", args, { input, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  assert.equal(run.status, 0, `docker ${args.slice(0, 3).join(" ")} failed:\n${run.stderr}`);
  return run.stdout;
}

/** Run a shell script in the toolchain container, feeding it stdin. */
const inContainer = (script: string, input?: string): string =>
  docker(["run", "--rm", "-i", IMAGE, "sh", "-c", script], input);

let imageBuilt = false;
function ensureImage(): void {
  if (imageBuilt) return;
  docker(["build", "-t", IMAGE, path.resolve(process.cwd(), "features/explorer/docker")]);
  imageBuilt = true;
}

Given("the GNU RISC-V toolchain container image", SLOW, ensureImage);

// ---- differential assembler and decoder

const MNEMONICS = [
  "add", "sub", "sll", "slt", "sltu", "xor", "srl", "sra", "or", "and",
  "mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu",
  "addi", "slti", "sltiu", "xori", "ori", "andi", "slli", "srli", "srai",
  "lb", "lh", "lw", "lbu", "lhu", "sb", "sh", "sw",
  "beq", "bne", "blt", "bge", "bltu", "bgeu", "lui", "auipc", "jal", "jalr", "ecall", "ebreak", "fence",
];

/**
 * The same instructions for both assemblers. GNU as needs `.+N` for a relative branch offset where
 * ours takes the plain number N, so each entry has a form per assembler. `call` is not included:
 * GNU expands it to auipc+jalr with a relocation, ours to a single jal (see docs/explorer.md).
 */
function corpus(): { ours: string[]; gnu: string[] } {
  const ours: string[] = [];
  const gnu: string[] = [];
  const both = (line: string) => {
    ours.push(line);
    gnu.push(line);
  };
  const relative = (op: string, regs: string, offset: number) => {
    ours.push(`${op} ${regs}${offset}`);
    gnu.push(`${op} ${regs}.${offset < 0 ? "-" : "+"}${Math.abs(offset)}`);
  };
  const triples = [["a2", "a0", "a1"], ["zero", "ra", "sp"], ["t6", "s11", "t5"], ["x5", "x6", "x7"], ["s0", "fp", "gp"]];
  const r = ["add", "sub", "sll", "slt", "sltu", "xor", "srl", "sra", "or", "and", "mul", "mulh", "mulhsu", "mulhu", "div", "divu", "rem", "remu"];
  for (const op of r) for (const [d, a, b] of triples) both(`${op} ${d}, ${a}, ${b}`);
  const imm12 = [-2048, -1, 0, 1, 2047];
  for (const op of ["addi", "slti", "sltiu", "xori", "ori", "andi"]) for (const v of imm12) both(`${op} a3, tp, ${v}`);
  for (const op of ["slli", "srli", "srai"]) for (const v of [0, 1, 31]) both(`${op} a3, s9, ${v}`);
  for (const op of ["lb", "lh", "lw", "lbu", "lhu", "sb", "sh", "sw"]) for (const v of imm12) both(`${op} a4, ${v}(s2)`);
  for (const op of ["beq", "bne", "blt", "bge", "bltu", "bgeu"]) {
    for (const v of [-4096, -8, -4, 0, 4, 8, 4094]) relative(op, "a0, a1, ", v);
  }
  for (const v of [-1048576, -4, 0, 4, 2048, 1048574]) relative("jal", "ra, ", v);
  for (const op of ["lui", "auipc"]) for (const v of [0, 1, 0x7ffff, 0x80000, 0xfffff]) both(`${op} t0, 0x${v.toString(16)}`);
  for (const line of ["jalr ra, 12(t0)", "jalr zero, 0(ra)", "jalr t1, -2048(a0)", "jalr t0", "ecall", "ebreak", "fence"]) both(line);
  for (const line of ["nop", "ret", "mv a0, a1", "jr t0", ".word 0xdeadbeef"]) both(line);
  relative("j", "", 0);
  for (const v of [0, 5, -2048, 2047, 2048, -2049, 0x12345800, 0x12345000, 0x7fffffff, -2147483648, 0xffffffff, 0x80000000]) {
    both(`li a0, ${v}`);
  }
  return { ours, gnu };
}

let oursWords: number[];
let gnuWords: number[];
let disassembly: { ours: string[]; objdump: string[] };

When("I assemble the generated corpus with GNU as -march=rv32im -mabi=ilp32 and with the explorer", SLOW, () => {
  const sources = corpus();
  const ours = assemble(sources.ours.join("\n"));
  assert.deepEqual(ours.errors, []);
  oursWords = ours.words;
  const script = `cat > /tmp/c.s && ${AS} -o /tmp/c.o /tmp/c.s && riscv64-unknown-elf-objcopy -O binary -j .text /tmp/c.o /tmp/c.bin && od -An -v -t x4 -w4 /tmp/c.bin`;
  gnuWords = inContainer(script, sources.gnu.join("\n") + "\n").split("\n").filter(Boolean).map((h) => parseInt(h.trim(), 16));
});

Then("the generated corpus assembles without errors and covers every RV32IM mnemonic", () => {
  const sources = corpus();
  assert.equal(sources.ours.length, sources.gnu.length);
  const result = assemble(sources.ours.join("\n"));
  assert.deepEqual(result.errors, []);
  const seen = new Set(result.words.map((w) => decode(w)?.mnemonic));
  assert.deepEqual(MNEMONICS.filter((m) => !seen.has(m)), []);
});

Then("the corpus exercises every RV32IM mnemonic", () => {
  const seen = new Set(gnuWords.map((w) => decode(w)?.mnemonic));
  assert.deepEqual(MNEMONICS.filter((m) => !seen.has(m)), []);
});

Then("both assemblers produce identical words", () => {
  const firstDifference = oursWords.findIndex((w, i) => w !== gnuWords[i]);
  assert.equal(oursWords.length, gnuWords.length, "word counts differ");
  assert.equal(firstDifference, -1, `word ${firstDifference} differs: ours 0x${oursWords[firstDifference]?.toString(16)}, GNU 0x${gnuWords[firstDifference]?.toString(16)}`);
});

const BASE = 0x200000; // far enough from zero that negative branch targets stay positive in the listing

/** objdump prints absolute hex branch targets and hex shift amounts; ours are relative decimals. */
function normalise(addr: number, mnemonic: string, operands: string, fromObjdump: boolean): string {
  const parts = operands.replace(/ /g, "").split(",").filter(Boolean);
  const last = parts.length - 1;
  if (["beq", "bne", "blt", "bge", "bltu", "bgeu", "jal"].includes(mnemonic)) {
    const target = fromObjdump ? parseInt(parts[last]!.replace(/<.*/, ""), 16) : addr + Number(parts[last]);
    parts[last] = target.toString(16);
  } else if (["slli", "srli", "srai"].includes(mnemonic)) {
    parts[last] = String(Number(parts[last]));
  }
  return `${mnemonic} ${parts.join(",")}`.trim();
}

When("I disassemble the corpus words with objdump -M no-aliases and with the explorer", SLOW, () => {
  const ours = assemble(corpus().ours.filter((l) => !l.startsWith(".word")).join("\n"));
  assert.deepEqual(ours.errors, []);
  const source = `.text\n${ours.words.map((w) => `.word 0x${w.toString(16)}`).join("\n")}\n`;
  const script = `cat > /tmp/d.s && ${AS} -o /tmp/d.o /tmp/d.s && riscv64-unknown-elf-objcopy -O binary -j .text /tmp/d.o /tmp/d.bin && riscv64-unknown-elf-objdump -D -b binary -m riscv:rv32 -M no-aliases --adjust-vma=0x${BASE.toString(16)} /tmp/d.bin`;
  const listing = inContainer(script, source);
  const theirs = new Map<number, string>();
  for (const line of listing.split("\n")) {
    const m = /^\s*([0-9a-f]+):\s+[0-9a-f]{8}\s+(\S+)\s*(.*)$/.exec(line);
    if (!m) continue;
    // objdump appends `# 0x...` comments with computed values and spells out fence's operands.
    const operands = m[2] === "fence" ? "" : m[3]!.replace(/\s*#.*$/, "");
    theirs.set(parseInt(m[1]!, 16), normalise(parseInt(m[1]!, 16), m[2]!, operands, true));
  }
  disassembly = { ours: [], objdump: [] };
  ours.words.forEach((word, i) => {
    const addr = BASE + 4 * i;
    const d = decode(word);
    const mine = d ? normalise(addr, d.mnemonic, d.operands, false) : `invalid 0x${word.toString(16)}`;
    disassembly.ours.push(mine);
    disassembly.objdump.push(theirs.get(addr) ?? `missing from objdump (0x${word.toString(16)})`);
  });
});

Then("both disassemblies agree after normalisation", () => {
  const { ours, objdump } = disassembly;
  const differences = ours.flatMap((mine, i) => (mine === objdump[i] ? [] : [`word ${i}: ours "${mine}" objdump "${objdump[i]}"`]));
  assert.deepEqual(differences, []);
});

// ---- riscv-tests

let programs: Map<string, Uint8Array | null>;

Given("the riscv-tests rv32ui and rv32um binaries built in the toolchain container", SLOW, () => {
  if (programs) return;
  ensureImage();
  programs = new Map();
  for (const line of inContainer("sh /sierrendipity/build-riscv-tests.sh").split("\n").filter(Boolean)) {
    const [name, data] = line.split(" ");
    programs.set(name!, data === "!" ? null : new Uint8Array(Buffer.from(data!, "base64")));
  }
});

Then("the riscv-tests program {word} exits with code 0", (name: string) => {
  const image = programs.get(name);
  assert.ok(image, `${name} did not build (see the container's stderr)`);
  const m = new Machine();
  m.load(image, 0, 0);
  m.run(5_000_000);
  assert.equal(m.state, "halted", `${name} ended ${m.state}: ${m.fault ?? "step limit"}`);
  assert.equal(m.exitCode, 0, `${name} failed test case ${(m.exitCode ?? 0) >> 1}`);
});
