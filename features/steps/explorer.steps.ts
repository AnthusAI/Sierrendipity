import { Given, When, Then, DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { assemble, decode, disassemble, encode, parseRegister, Machine, SPECS } from "../../explorer/src/index.ts";
import type { Assembly, Instruction } from "../../explorer/src/index.ts";

let decoded: Instruction | undefined;
let assembly: Assembly;
let program = "";
let machine: Machine;

const hex = (s: string) => Number(s) >>> 0;
const source = (text: string) => text.replace(/\\n/g, "\n");
const register = (name: string) => {
  const r = parseRegister(name);
  assert.notEqual(r, undefined, `unknown register ${name}`);
  return r!;
};

When("I decode the word {word}", (word: string) => {
  decoded = decode(hex(word));
});

Then("the instruction is {string}", (text: string) => {
  assert.ok(decoded, "word did not decode");
  assert.equal(disassemble(decoded), text);
});

Then("the word is not a valid instruction", () => {
  assert.equal(decoded, undefined);
});

When("I assemble {string}", (text: string) => {
  assembly = assemble(text);
});

When("I assemble the program", (text: string) => {
  assembly = assemble(source(text));
});

Then("the machine code is {word}", (word: string) => {
  assert.deepEqual(assembly.errors, []);
  assert.deepEqual(assembly.words, [hex(word)]);
});

Then("there are no assembly errors", () => assert.deepEqual(assembly.errors, []));

Then("label {string} is at address {int}", (label: string, address: number) => {
  assert.equal(assembly.labels[label], address);
});

Then("the program has {int} words", (n: number) => assert.equal(assembly.words.length, n));

Then("the assembly errors are", (table: DataTable) => {
  const expected = table.hashes().map((r) => ({ line: Number(r.line), message: r.message }));
  assert.deepEqual(assembly.errors, expected);
});

Then("every instruction round-trips through its machine code and its assembly text", () => {
  // Immediates exercising sign bits and every bit position of each format.
  const imms: Record<string, number[]> = {
    I: [0, 1, -1, 2047, -2048], S: [0, 4, -4, 2047, -2048], B: [0, 2, -2, 4094, -4096, 0x7fe],
    U: [0, 0x1000, 0xfffff000 | 0, 0x12345000], J: [0, 2, -2, 1048574, -1048576, 0x7fe],
  };
  let checked = 0;
  for (const [op, spec] of Object.entries(SPECS)) {
    const values = spec.fmt === "R" ? [0] : spec.kind === "system" ? [spec.fixedImm!] : spec.shift ? [0, 1, 31] : imms[spec.fmt];
    for (const imm of values) {
      const i: Instruction = {
        op,
        rd: spec.fmt === "S" || spec.fmt === "B" || spec.kind === "system" ? 0 : 5,
        rs1: spec.fmt === "U" || spec.fmt === "J" || spec.kind === "system" ? 0 : 6,
        rs2: spec.fmt === "R" || spec.fmt === "S" || spec.fmt === "B" ? 7 : 0,
        imm,
      };
      const word = encode(i);
      assert.deepEqual(decode(word), i, `${op} imm ${imm}`);
      const text = disassemble(i);
      const again = assemble(text);
      assert.deepEqual(again.errors, [], text);
      assert.deepEqual(again.words, [word], text);
      checked++;
    }
  }
  assert.ok(checked > Object.keys(SPECS).length);
});

Given("the program", (text: string) => {
  program = source(text);
});

const assembleProgram = () => {
  const a = assemble(program);
  assert.deepEqual(a.errors, []);
  return a;
};

When("I run it from assembly", () => {
  machine = new Machine();
  machine.load(assembleProgram().words);
  machine.run();
});

When("I run it from its machine code", () => {
  const bytes = assembleProgram().words.map((w) => w.toString(16).padStart(8, "0"));
  machine = new Machine();
  machine.load(bytes.map((h) => parseInt(h, 16)));
  machine.run();
});

When("I load it into a machine and step {int} time(s)", (n: number) => {
  machine = new Machine();
  machine.load(assembleProgram().words);
  for (let i = 0; i < n; i++) machine.step();
});

When("I step {int} time(s)", (n: number) => {
  for (let i = 0; i < n; i++) machine.step();
});

Then("the machine halts with exit code {int}", (code: number) => {
  assert.equal(machine.status, "halted", machine.fault);
  assert.equal(machine.exitCode, code);
});

Then("the machine output is {string}", (text: string) => assert.equal(machine.output, text));

Then("the machine faults with {string}", (text: string) => {
  assert.equal(machine.status, "faulted");
  assert.match(machine.fault ?? "", new RegExp(text));
});

Then("register {word} is {int}", (name: string, value: number) => {
  assert.equal(machine.regs[register(name)], value);
});

Then("the program counter is {int}", (pc: number) => assert.equal(machine.pc, pc));

Then("memory word at {int} is {int}", (addr: number, value: number) => {
  assert.equal(machine.read(addr, 4, true), value);
});
