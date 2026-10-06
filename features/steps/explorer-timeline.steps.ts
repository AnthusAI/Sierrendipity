import { Before, Given, Then, When } from "@cucumber/cucumber";
import type { DataTable } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { assemble, Machine, registerName, Timeline, type Snapshot } from "@sierrendipity/explorer";

let machine: Machine;
let timeline: Timeline;
let machineOutput: Map<number, string>;
let program: Uint8Array;
let recorded: Snapshot[];
let playCount: number;
let playAdvanced: number;
let seekError: unknown;

const REGISTER_NUMBERS = new Map(Array.from({ length: 32 }, (_, n) => [registerName(n), n] as const));
const register = (name: string): number => {
  const n = REGISTER_NUMBERS.get(name);
  assert.notEqual(n, undefined, `unknown register ${name}`);
  return n!;
};

Before(() => {
  machineOutput = new Map();
  recorded = [];
  seekError = undefined;
});

function build(source: string, maxSteps?: number): void {
  const result = assemble(source);
  assert.deepEqual(result.errors, [], "the program should assemble");
  program = new Uint8Array(result.words.length * 4);
  const view = new DataView(program.buffer);
  result.words.forEach((w, i) => view.setUint32(i * 4, w >>> 0, true));
  machine = newMachine();
  timeline = new Timeline(machine, maxSteps === undefined ? {} : { maxSteps });
}

function newMachine(): Machine {
  const m = new Machine({
    io: {
      write: (fd, bytes) => machineOutput.set(fd, (machineOutput.get(fd) ?? "") + new TextDecoder().decode(bytes)),
      read: () => null,
    },
  });
  m.load(program, 0, 0);
  return m;
}

Given("a timeline for the program", (source: string) => build(source));
Given("a timeline limited to {int} steps for the program", (maxSteps: number, source: string) => build(source, maxSteps));
Given("the machine has a breakpoint at {int}", (pc: number) => machine.breakpoints.add(pc));

When("I step the timeline forward {int} times", (count: number) => {
  for (let i = 0; i < count; i++) timeline.stepForward();
});
When("I run the timeline to the end", () => {
  timeline.runToEnd(1_000_000);
});
When("I seek to position {int}", (position: number) => timeline.seek(position));
When("I seek to the end", () => timeline.seek(timeline.length));
When("I seek to position {float} expecting an error", (position: number) => {
  try {
    timeline.seek(position);
  } catch (e) {
    seekError = e;
  }
});
When("I reset the timeline", () => timeline.reset());
When("I provide the input {string} to the timeline", (text: string) => {
  timeline.provideInput(new TextEncoder().encode(text));
});
When("I play {int} steps at a time until the timeline is at the end", (steps: number) => {
  playCount = 0;
  while (!timeline.isAtEnd) {
    timeline.play({ steps });
    playCount++;
    assert.ok(playCount < 1000, "playing should reach the end");
  }
});
When("I play up to {int} steps", (steps: number) => {
  playAdvanced = timeline.play({ steps });
});
When("I record a snapshot at every position", () => {
  recorded = Array.from({ length: timeline.length + 1 }, (_, p) => timeline.snapshotAt(p));
});

const comparable = (s: Snapshot) => ({ ...s, lastStep: s.lastStep ? { ...s.lastStep, decoded: s.lastStep.decoded?.text } : undefined });

Then("the timeline has length {int} and position {int}", (length: number, position: number) => {
  assert.equal(timeline.length, length);
  assert.equal(timeline.position, position);
});
Then("the timeline has more than {int} steps", (n: number) => {
  assert.ok(timeline.length > n, `length ${timeline.length}`);
});
Then("the timeline is at the end", () => assert.equal(timeline.isAtEnd, true));
Then("the timeline is not at the end", () => assert.equal(timeline.isAtEnd, false));
Then("stepping forward once more fails", () => assert.equal(timeline.stepForward(), false));

Then("at the current position register {word} is {int} and register {word} is {int}", (a: string, av: number, b: string, bv: number) => {
  const snap = timeline.snapshotAt(timeline.position);
  assert.equal(snap.regs[register(a)], av);
  assert.equal(snap.regs[register(b)], bv);
});
Then("at the current position register {word} is {int}", (a: string, av: number) => {
  assert.equal(timeline.snapshotAt(timeline.position).regs[register(a)], av);
});
Then("at the current position register {word} is {int} and the byte at {int} is {int}", (a: string, av: number, addr: number, byte: number) => {
  assert.equal(timeline.snapshotAt(timeline.position).regs[register(a)], av);
  assert.equal(timeline.readMem(addr, 1)[0], byte);
});
Then(
  "at the current position register {word} is {int} and register {word} is {int} and the byte at {int} is {int}",
  (a: string, av: number, b: string, bv: number, addr: number, byte: number) => {
    const snap = timeline.snapshotAt(timeline.position);
    assert.equal(snap.regs[register(a)], av);
    assert.equal(snap.regs[register(b)], bv);
    assert.equal(timeline.readMem(addr, 1)[0], byte);
  },
);
Then("at the current position the byte at {int} is {int}", (addr: number, byte: number) => {
  assert.equal(timeline.readMem(addr, 1)[0], byte);
});

Then("the snapshot at position {int} has state {string}, pc {int} and {int} steps", (p: number, state: string, pc: number, steps: number) => {
  const s = timeline.snapshotAt(p);
  assert.equal(s.state, state);
  assert.equal(s.pc, pc);
  assert.equal(s.steps, steps);
});
Then("the snapshot at position {int} has no last step", (p: number) => assert.equal(timeline.snapshotAt(p).lastStep, undefined));
Then("the snapshot at position {int} has last step pc {int} and text {string}", (p: number, pc: number, text: string) => {
  const last = timeline.snapshotAt(p).lastStep;
  assert.ok(last);
  assert.equal(last.pc, pc);
  assert.equal(last.decoded?.text, text);
});
Then("the snapshot at position {int} has state {string}", (p: number, state: string) => {
  assert.equal(timeline.snapshotAt(p).state, state);
});
Then("the snapshot at the current position has state {string}", (state: string) => {
  assert.equal(timeline.snapshotAt(timeline.position).state, state);
});
Then("the snapshot at the current position has {int} steps", (steps: number) => {
  assert.equal(timeline.snapshotAt(timeline.position).steps, steps);
});
Then("the snapshot at the current position has a fault mentioning {string}", (text: string) => {
  assert.match(timeline.snapshotAt(timeline.position).fault ?? "", new RegExp(text));
});

Then("visiting every position forwards gives the recorded snapshots", () => {
  for (let p = 0; p < recorded.length; p++) {
    timeline.seek(p);
    assert.deepEqual(comparable(timeline.snapshotAt(timeline.position)), comparable(recorded[p]!), `position ${p}`);
  }
});
Then("visiting every position backwards gives the recorded snapshots", () => {
  for (let p = recorded.length - 1; p >= 0; p--) {
    timeline.seek(p);
    assert.deepEqual(comparable(timeline.snapshotAt(timeline.position)), comparable(recorded[p]!), `position ${p}`);
  }
});

Then("stepping backward {int} times succeeds and a {int}th time fails", (times: number, _nth: number) => {
  for (let i = 0; i < times; i++) assert.equal(timeline.stepBackward(), true, `step back ${i + 1}`);
  assert.equal(timeline.stepBackward(), false);
});
Then("stepping forward again {int} times succeeds without recording new steps", (times: number) => {
  const length = timeline.length;
  for (let i = 0; i < times; i++) assert.equal(timeline.stepForward(), true);
  assert.equal(timeline.length, length);
});

Then("it took {int} plays", (n: number) => assert.equal(playCount, n));
Then("the play advanced {int} steps and the timeline is at position {int}", (steps: number, position: number) => {
  assert.equal(playAdvanced, steps);
  assert.equal(timeline.position, position);
});

Then("the seek was refused with a range error", () => assert.ok(seekError instanceof RangeError));

Then("the diff from {int} to {int} changes registers", (a: number, b: number, table: DataTable) => {
  const actual = timeline.diff(a, b).regs.map((r) => ({ register: registerName(r.reg), before: String(r.before), after: String(r.after) }));
  assert.deepEqual(actual, table.hashes());
});
Then("the diff from {int} to {int} changes no registers", (a: number, b: number) => {
  assert.deepEqual(timeline.diff(a, b).regs, []);
});
Then("the diff from {int} to {int} changes no memory", (a: number, b: number) => {
  assert.deepEqual(timeline.diff(a, b).memory, []);
});
const hexBytes = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
Then("the diff from {int} to {int} changes memory at {int} from {string} to {string}", (a: number, b: number, addr: number, before: string, after: string) => {
  const memory = timeline.diff(a, b).memory;
  assert.equal(memory.length, 1);
  assert.equal(memory[0]!.addr, addr);
  assert.equal(hexBytes(memory[0]!.before), before);
  assert.equal(hexBytes(memory[0]!.after), after);
});
Then("the diff from {int} to {int} moves the pc from {int} to {int}", (a: number, b: number, before: number, after: number) => {
  assert.deepEqual(timeline.diff(a, b).pc, { before, after });
});

Then("the snapshot at the current position matches a fresh machine after {int} steps", (steps: number) => {
  assert.equal(timeline.position, steps);
  assertMatchesFresh(steps);
});
Then("the snapshot at the current position matches a fresh machine after all the steps", () => {
  assertMatchesFresh(timeline.position);
});

function assertMatchesFresh(position: number): void {
  const fresh = newMachine();
  for (let i = 0; i < position; i++) fresh.step();
  const snap = timeline.snapshotAt(position);
  assert.equal(snap.pc, fresh.pc, "pc");
  assert.equal(snap.state, fresh.state, "state");
  assert.equal(snap.steps, fresh.steps, "steps");
  assert.equal(snap.exitCode, fresh.exitCode, "exit code");
  assert.deepEqual(snap.regs, Array.from(fresh.regs), "registers");
  assert.deepEqual(timeline.readMem(0, 4096, position), fresh.readMem(0, 4096), "memory");
}

Then("{int} random positions match a fresh machine run", (count: number) => {
  let seed = 12345;
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  for (let i = 0; i < count; i++) assertMatchesFresh(next() % (timeline.length + 1));
});

Then("the machine's own output on fd 1 is {string}", (text: string) => assert.equal(machineOutput.get(1) ?? "", text));
Then("the timeline output at position {int} is {string}", (p: number, text: string) => assert.equal(timeline.outputText(1, p), text));
Then("the timeline output at the end is {string}", (text: string) => assert.equal(timeline.outputText(1, timeline.length), text));
Then("the timeline output log has {int} entry for step {int} on fd {int}", (count: number, step: number, fd: number) => {
  assert.equal(timeline.outputLog.length, count);
  assert.equal(timeline.outputLog[0]!.step, step);
  assert.equal(timeline.outputLog[0]!.fd, fd);
});

Then("the input log has one entry of {string} at position {int}", (text: string, position: number) => {
  assert.equal(timeline.inputLog.length, 1);
  assert.equal(new TextDecoder().decode(timeline.inputLog[0]!.bytes), text);
  assert.equal(timeline.inputLog[0]!.position, position);
});

Then("the timeline has hit its step limit", () => assert.equal(timeline.hitStepLimit, true));
Then("the timeline has not hit its step limit", () => assert.equal(timeline.hitStepLimit, false));

Then("{int} random diffs, including neighbouring positions, match two fresh machine runs", (count: number) => {
  const memoryAt = new Map<number, Uint8Array>();
  const at = (p: number): Uint8Array => {
    let mem = memoryAt.get(p);
    if (!mem) {
      const fresh = newMachine();
      for (let i = 0; i < p; i++) fresh.step();
      mem = fresh.readMem(0, 4096);
      memoryAt.set(p, mem);
    }
    return mem;
  };
  let seed = 4242;
  const next = (n: number): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 8) % n;
  };
  const clamp = (p: number): number => Math.max(0, Math.min(timeline.length, p));
  for (let i = 0; i < count; i++) {
    const a = next(timeline.length + 1);
    const b = [() => next(timeline.length + 1), () => clamp(a + 1), () => clamp(a - 1)][i % 3]!();
    const expected = new Map<number, string>();
    const [ma, mb] = [at(a), at(b)];
    for (let addr = 0; addr < ma.length; addr++) if (ma[addr] !== mb[addr]) expected.set(addr, `${ma[addr]}>${mb[addr]}`);
    const actual = new Map<number, string>();
    for (const change of timeline.diff(a, b).memory) {
      change.before.forEach((before, k) => actual.set(change.addr + k, `${before}>${change.after[k]}`));
    }
    assert.deepEqual([...actual].sort((x, y) => x[0] - y[0]), [...expected].sort((x, y) => x[0] - y[0]), `diff(${a}, ${b})`);
  }
});

let heapUsed: number | undefined;
When("I run the timeline to the end measuring the heap", () => {
  const gc = (globalThis as { gc?: () => void }).gc;
  gc?.();
  const before = process.memoryUsage();
  timeline.runToEnd(1_000_000);
  gc?.();
  const after = process.memoryUsage();
  heapUsed = gc ? after.heapUsed + after.external - before.heapUsed - before.external : undefined;
});
Then("the recording took under {int} MB of heap when garbage collection is exposed", (mb: number) => {
  if (heapUsed === undefined) return; // run with NODE_OPTIONS=--expose-gc to measure
  console.log(`timeline heap for 500k steps: ${(heapUsed / 1e6).toFixed(1)} MB`);
  assert.ok(heapUsed < mb * 1e6, `${(heapUsed / 1e6).toFixed(1)} MB`);
});
