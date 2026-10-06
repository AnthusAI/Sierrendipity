import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { assemble, Machine, registerName, type MachineIO, type StepResult } from "@sierrendipity/explorer";

const REGISTER_NUMBERS = new Map(Array.from({ length: 32 }, (_, n) => [registerName(n), n] as const));

let machine: Machine;
let output: Map<number, string>;
let pendingData: { addr: number; bytes: Uint8Array }[];
let customRead: MachineIO["read"] | undefined;
let lastStep: StepResult;
let snapshots: Snapshot[];

type Snapshot = { pc: number; regs: number[]; state: string; steps: number; exitCode: number | null; mem: string };

Before(() => {
  output = new Map();
  pendingData = [];
  customRead = undefined;
  snapshots = [];
});

const toNumber = (text: string): number => Number(text) >>> 0;
const register = (name: string): number => {
  const n = REGISTER_NUMBERS.get(name);
  assert.notEqual(n, undefined, `unknown register ${name}`);
  return n!;
};
const hexBytes = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

const io = (): MachineIO => ({
  write: (fd, bytes) => output.set(fd, (output.get(fd) ?? "") + new TextDecoder().decode(bytes)),
  read: (fd, max) => customRead?.(fd, max) ?? null,
});

/** Assemble the program, place any pending data, and load everything at address 0. */
function startMachine(source: string, memorySize?: number): void {
  const result = assemble(source);
  assert.deepEqual(result.errors, [], "the program should assemble");
  const code = new Uint8Array(result.words.length * 4);
  const view = new DataView(code.buffer);
  result.words.forEach((w, i) => view.setUint32(i * 4, w, true));
  const image = new Uint8Array(Math.max(code.length, ...pendingData.map((d) => d.addr + d.bytes.length)));
  image.set(code);
  for (const d of pendingData) image.set(d.bytes, d.addr);
  machine = new Machine({ memorySize, io: io() });
  machine.load(image, 0, 0);
}

Given("the text {string} is in memory at {word}", (text: string, addr: string) => {
  pendingData.push({ addr: toNumber(addr), bytes: new TextEncoder().encode(text.replace(/\\n/g, "\n")) });
});

Given("an io whose read has nothing the first time and then supplies {string}", (text: string) => {
  let asked = 0;
  customRead = () => (asked++ === 0 ? null : new TextEncoder().encode(text));
});

Given("a machine running the program", (source: string) => startMachine(source));

Given("a machine with {int} bytes of memory running the program", (size: number, source: string) =>
  startMachine(source, size));

Given("a breakpoint at {word}", (addr: string) => {
  machine.breakpoints.add(toNumber(addr));
});

When("I compute {string} with a0 = {word} and a1 = {word}", (instruction: string, a0: string, a1: string) => {
  startMachine(`li a0, ${a0}\nli a1, ${a1}\n${instruction}\nebreak`);
  machine.run();
  assert.equal(machine.state, "halted", machine.fault ?? "");
});

When("I branch with {word} on a0 = {word} and a1 = {word}", (branch: string, a0: string, a1: string) => {
  startMachine(
    `li a0, ${a0}\nli a1, ${a1}\n${branch} a0, a1, taken\nli a2, 0\nebreak\ntaken: li a2, 1\nebreak`,
  );
  machine.run();
  assert.equal(machine.state, "halted", machine.fault ?? "");
});

When("I run the machine", () => {
  machine.run();
});

When("I run the machine for at most {int} steps", (max: number) => {
  machine.run(max);
});

When("I step the machine", () => {
  lastStep = machine.step();
});

When("I step the machine {int} times", (count: number) => {
  for (let i = 0; i < count; i++) lastStep = machine.step();
});

When("I step back", () => {
  assert.ok(machine.stepBack(), "there should be history to step back through");
});

When("I step back {int} times", (count: number) => {
  for (let i = 0; i < count; i++) assert.ok(machine.stepBack(), "there should be history to step back through");
});

When("I provide the input {string}", (text: string) => {
  machine.provideInput(new TextEncoder().encode(text));
});

When("I provide end of input", () => {
  machine.provideInput(new Uint8Array(0));
});

When("I reset the machine", () => {
  machine.reset();
});

const snapshot = (): Snapshot => ({
  pc: machine.pc,
  regs: Array.from(machine.regs),
  state: machine.state,
  steps: machine.steps,
  exitCode: machine.exitCode,
  mem: hexBytes(machine.readMem(0x2000, 8)),
});

When("I step the machine {int} times recording each state", (count: number) => {
  snapshots = [snapshot()];
  for (let i = 0; i < count; i++) {
    lastStep = machine.step();
    snapshots.push(snapshot());
  }
});

Then("stepping back {int} times restores every recorded state exactly", (count: number) => {
  for (let i = count - 1; i >= 0; i--) {
    assert.ok(machine.stepBack(), `step back to state ${i}`);
    assert.deepEqual(snapshot(), snapshots[i], `state after stepping back to ${i}`);
  }
});

Then("stepping back once more fails", () => {
  assert.equal(machine.stepBack(), false);
});

Then("I can step back between {int} and {int} times", (min: number, max: number) => {
  let count = 0;
  while (machine.stepBack()) count++;
  assert.ok(count >= min && count <= max, `stepped back ${count} times`);
});

Then("the machine is {word}", (state: string) => {
  assert.equal(machine.state, state, machine.fault ?? "");
});

Then("the program counter is {word}", (pc: string) => {
  assert.equal(machine.pc, toNumber(pc));
});

Then("register {word} holds {word}", (name: string, value: string) => {
  assert.equal(machine.regs[register(name)], toNumber(value));
});

Then("the result is {word}", (value: string) => {
  assert.equal(machine.regs[12], toNumber(value));
});

Then("the branch is taken", () => assert.equal(machine.regs[12], 1));
Then("the branch is not taken", () => assert.equal(machine.regs[12], 0));

Then("the step count is {int}", (steps: number) => {
  assert.equal(machine.steps, steps);
});

Then("there is no exit code", () => {
  assert.equal(machine.exitCode, null);
});

Then("the machine exit code is {int}", (code: number) => {
  assert.equal(machine.exitCode, code);
});

Then("the fault is {string}", (message: string) => {
  assert.equal(machine.fault, message);
});

Then("the fault is none", () => {
  assert.equal(machine.fault, null);
});

Then("memory at {word} holds {string}", (addr: string, bytes: string) => {
  assert.equal(hexBytes(machine.readMem(toNumber(addr), bytes.split(" ").length)), bytes);
});

Then("the output on file descriptor {int} is {string}", (fd: number, text: string) => {
  assert.equal(output.get(fd), text.replace(/\\n/g, "\n"));
});

Then("the step result shows pc {word}, word {word} and text {string}", (pc: string, word: string, text: string) => {
  assert.equal(lastStep.pc, toNumber(pc));
  assert.equal(lastStep.word, toNumber(word));
  assert.equal(lastStep.decoded?.text, text);
});

Then("the step changed registers {string}", (names: string) => {
  assert.deepEqual(lastStep.changedRegs.map(registerName), names === "" ? [] : names.split(" "));
});

Then("the step wrote no memory", () => {
  assert.equal(lastStep.memWrite, undefined);
});

Then("the step wrote {int} bytes at {word}", (length: number, addr: string) => {
  assert.deepEqual(lastStep.memWrite, { addr: toNumber(addr), length });
});
