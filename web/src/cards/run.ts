import { Machine, registerName } from "@sierrendipity/explorer";

export interface TraceEntry {
  pc: number;
  /** The real instruction, for example `jal ra, 8`. */
  text: string;
  /** Boxes the step changed, with their new values. */
  changed: { box: string; value: number }[];
}

export interface RunResult {
  state: string;
  fault: string | null;
  regs: number[];
  trace: TraceEntry[];
}

/** Run words from address 0 on a real Machine (it stops at the first `ebreak`). */
export function runWords(words: number[], maxSteps = 5000): RunResult {
  const memorySize = 1 << 16;
  if (words.length * 4 > memorySize / 2) return { state: "too big", fault: null, regs: new Array<number>(32).fill(0), trace: [] };
  try {
    return execute(words, maxSteps, memorySize);
  } catch (error) {
    return { state: "error", fault: (error as Error).message, regs: new Array<number>(32).fill(0), trace: [] };
  }
}

function execute(words: number[], maxSteps: number, memorySize: number): RunResult {
  const machine = new Machine({ memorySize });
  const image = new Uint8Array(words.length * 4);
  const view = new DataView(image.buffer);
  words.forEach((word, i) => view.setUint32(i * 4, word >>> 0, true));
  machine.load(image, 0, 0);
  const trace: TraceEntry[] = [];
  for (let n = 0; n < maxSteps && (machine.state === "ready" || machine.state === "running"); n++) {
    const step = machine.step();
    trace.push({
      pc: step.pc,
      text: step.decoded?.text ?? "?",
      changed: step.changedRegs.map((r) => ({ box: registerName(r), value: machine.regs[r]! })),
    });
  }
  return { state: machine.state, fault: machine.fault, regs: Array.from(machine.regs), trace };
}
