// Docker-dependent explorer specs (tagged @docker). UNVERIFIED until run on a machine with Docker:
//   npm run test:docker
import { Given, When, Then, Before, After } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { assemble, decode, disassemble, Machine } from "../../explorer/src/index.ts";

const IMAGE = "sierrendipity-explorer-toolchain";
let dir = "";
let gnuWords: number[] = [];
let ours: number[] = [];
let sample = "";
let tests: string[] = [];

Before({ tags: "@docker" }, () => {
  dir = mkdtempSync(join(tmpdir(), "explorer-"));
  execFileSync("docker", ["build", "-t", IMAGE, "-f", "explorer/docker/Dockerfile", "explorer"], { stdio: "pipe" });
});
After({ tags: "@docker" }, () => rmSync(dir, { recursive: true, force: true }));

const inContainer = (script: string) =>
  execFileSync("docker", ["run", "--rm", "-v", `${dir}:/work`, "-w", "/work", IMAGE, "sh", "-c", script], { encoding: "utf8" });

const words = (buf: Buffer) => Array.from({ length: buf.length / 4 }, (_, i) => buf.readUInt32LE(i * 4));

Given("the sample program from {string}", (path: string) => {
  sample = readFileSync(path, "utf8");
  writeFileSync(join(dir, "p.s"), sample);
});

When("GNU as assembles it for rv32i", () => {
  inContainer("riscv64-unknown-elf-as -march=rv32i -mabi=ilp32 -o p.o p.s && riscv64-unknown-elf-objcopy -O binary -j .text p.o p.bin");
  gnuWords = words(readFileSync(join(dir, "p.bin")));
});

When("the explorer assembles it", () => {
  const a = assemble(sample.replace(/^\s*\.text\s*$/m, ""));
  assert.deepEqual(a.errors, []);
  ours = a.words;
});

Then("both produce the same machine code", () => assert.deepEqual(ours, gnuWords));

Then("objdump and the explorer disassembler show the same mnemonics and operands", () => {
  // numeric register names and no aliases, so the text is comparable after normalising register names.
  const dump = inContainer("riscv64-unknown-elf-objdump -d -M no-aliases,numeric p.o");
  const norm = (s: string) => s.replace(/\s+/g, " ").replace(/\bx(\d+)\b/g, "x$1").trim();
  const toNumeric = (s: string) => s.replace(/\b(zero|ra|sp|gp|tp|[ast]\d+)\b/g, (n) => {
    const names = ["zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2", "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7",
      "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6"];
    return `x${names.indexOf(n)}`;
  });
  const lines = dump.split("\n").filter((l) => /^\s+[0-9a-f]+:\s+[0-9a-f]{8}\s/.test(l));
  assert.equal(lines.length, gnuWords.length);
  lines.forEach((line, i) => {
    const gnu = norm(line.replace(/^\s+[0-9a-f]+:\s+[0-9a-f]{8}\s+/, "").replace(/\s*<.*>$/, ""));
    const mine = norm(toNumeric(disassemble(decode(gnuWords[i])!)));
    // Branch and jump targets: objdump prints absolute addresses, the explorer prints offsets. Compare the mnemonic only.
    if (/^(b\w+|jal) /.test(gnu)) assert.equal(mine.split(" ")[0], gnu.split(" ")[0], line);
    else assert.equal(mine.replace(/0x([0-9a-f]+)$/, "0x$1"), gnu.replace(/, 0x0*([0-9a-f]+)$/, ", 0x$1"), line);
  });
});

Given("the riscv-tests rv32ui suite at the tag {string}", (tag: string) => {
  // riscv-tests need a clean checkout and its env headers; build each rv32ui test as a bare ELF-less binary.
  inContainer(`git clone --quiet --depth 1 --branch ${tag} https://github.com/riscv-software-src/riscv-tests.git rt`);
  for (const f of ["riscv_test.h", "link.ld"]) copyFileSync(join("explorer/riscv-tests-env", f), join(dir, "env-" + f));
  tests = [];
});

When("each test is built for the explorer and run to completion", () => {
  // Uses the explorer's own env (explorer/riscv-tests-env/): tests start at 0 and end in `li a7, 93; ecall`,
  // with a0 = 0 on pass and (TESTNUM << 1) | 1 on failure. riscv_test.h is found first via -I/work/inc.
  inContainer(
    "mkdir -p inc && cp env-riscv_test.h inc/riscv_test.h && cd rt/isa/rv32ui && " +
      "for t in *.S; do n=${t%.S}; " +
      "riscv64-unknown-elf-gcc -march=rv32i -mabi=ilp32 -static -mcmodel=medany -nostdlib -nostartfiles " +
      "-I/work/inc -I/work/rt/isa/macros/scalar -T/work/env-link.ld $t -o /work/$n.elf && " +
      "riscv64-unknown-elf-objcopy -O binary /work/$n.elf /work/$n.bin; done",
  );
  tests = readdirSync(dir).filter((f) => f.endsWith(".bin"));
});

Then("every test exits with code 0", () => {
  assert.ok(tests.length > 0, "no tests built");
  for (const t of tests) {
    const m = new Machine(1 << 20);
    m.load(words(readFileSync(join(dir, t))));
    m.run(5_000_000);
    assert.equal(m.status, "halted", `${basename(t)}: ${m.fault ?? "did not halt"}`);
    assert.equal(m.exitCode, 0, `${basename(t)} failed test ${(m.exitCode ?? 0) >> 1}`);
  }
});
