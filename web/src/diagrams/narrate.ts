import { describe, registerName } from "@sierrendipity/explorer";
import { registerIndex, type MachineTimeline, type StepInfo } from "./useMachineTimeline";

export type NumberFormat = "signed" | "unsigned";

/** The blank shown in a box nothing has been put in yet. */
export const BLANK = "–";

/** The most log entries drawn: the newest ones, so a long run stays cheap to render and to read out. */
export const LOG_LIMIT = 50;

export const formatValue = (value: number, format: NumberFormat = "signed") => String(format === "signed" ? value | 0 : value >>> 0);

/**
 * The plain words of the card at `index` in the boxes vocabulary. Jumps read as "jump back 2 cards":
 * a relative distance, so no card number is printed here (the diagrams number cards from 1).
 */
export const cardText = (word: number) => describe(word, { vocabulary: "boxes" }).text;

/** Card numbers in prose count from 1; byte addresses are only ever called "address". */
const cardNumber = (pc: number) => pc / 4 + 1;

export interface LogEntry {
  step: number;
  /** The sentences of the step, e.g. "Box a0 changed from – to 5." */
  sentences: string[];
}

/** Why the machine stopped, for a student. `fault` is the machine's own message. */
export function explainFault(fault: string, pc: number, cardCount: number): string {
  if (pc / 4 >= cardCount) return "it ran past the last card.";
  const misaligned = /misaligned (\w+) address/.exec(fault);
  if (misaligned) return `that shelf number is not a multiple of ${/^[ls]h/.test(misaligned[1]) ? 2 : 4}.`;
  if (/misaligned (jump|instruction)/.test(fault)) return "it was told to go somewhere that is not the start of a card.";
  if (/jump target .* out of range|instruction fetch out of range/.test(fault)) return "it was told to go somewhere outside the machine's memory.";
  if (/out of range/.test(fault)) return "that shelf number is outside the machine's memory.";
  if (/illegal instruction/.test(fault)) return "it found something that is not a card.";
  return `something went wrong (${fault.replace(/ at pc .*/, "")}).`;
}

/** What the machine says when it cannot go on: a fault at the current step, or the step limit. Null otherwise. */
export function stopNotice(tl: MachineTimeline): string | null {
  if (!tl.isAtEnd) return null;
  const last = tl.lastStep;
  if (last?.fault) return `The machine stopped: ${explainFault(last.fault, last.pc, tl.words.length)}`;
  if (tl.hitStepLimit) return `This program keeps going. The machine stopped after ${tl.maxSteps} steps to protect you.`;
  return null;
}

const operandReg = (info: StepInfo, field: string) => info.decoded?.fields.find((f) => f.name === field)?.value ?? 0;

/** The shelf a load or store used: base register plus offset, from the decoded `imm(reg)` operand. */
function shelfOf(info: StepInfo): number | null {
  const match = /(-?\d+)\((\w+)\)/.exec(info.decoded?.operands ?? "");
  if (!match) return null;
  return (info.before[registerIndex(match[2])] + Number(match[1])) >>> 0;
}

function jumpSentence(tl: MachineTimeline, info: StepInfo) {
  const target = info.nextPc / 4;
  if (target === tl.words.length && tl.hideEnd) return "Jumped to the end of the list.";
  if (target >= tl.words.length) return "Jumped past the last card.";
  return `Jumped to card ${target + 1}.`;
}

/** The sentences for one step (never a fault; faults are `explainFault`). */
function sentencesFor(tl: MachineTimeline, info: StepInfo, step: number, format: NumberFormat): string[] {
  const sentences: string[] = [];
  const kind = describe(info.word).kind;
  for (const name of tl.boxes) {
    const reg = registerIndex(name);
    if (info.rd !== reg || reg === 0) continue;
    const first = tl.firstWrite.get(reg) === step;
    const was = first ? BLANK : formatValue(info.before[reg], format);
    const now = formatValue(info.after[reg], format);
    sentences.push(!first && info.before[reg] === info.after[reg] ? `Box ${name} was set to ${now} again; it already held that.` : `Box ${name} changed from ${was} to ${now}.`);
  }
  if (kind === "jump-if-same" || kind === "jump-if-different" || kind === "jump-if-smaller" || kind === "jump-if-not-smaller") {
    sentences.push(info.nextPc === info.pc + 4 ? "Did not jump." : jumpSentence(tl, info));
  } else if (kind === "jump" || kind === "jump-to-box") {
    sentences.push(jumpSentence(tl, info));
  } else if (kind === "stop") {
    sentences.push("Reached the Stop card, so the machine stopped.");
  } else if (info.memWrite && (kind === "save" || kind === "paint-pixel")) {
    const source = info.before[operandReg(info, "rs2")];
    const length = info.memWrite.length;
    const value = length === 1 ? source & 0xff : length === 2 ? source & 0xffff : source | 0;
    sentences.push(kind === "paint-pixel" ? `Painted pixel ${info.memWrite.addr - 1024} with color ${value}.` : `Saved ${value} on shelf ${info.memWrite.addr}.`);
  } else if (kind === "fetch" && info.rd) {
    sentences.push(`Fetched ${formatValue(info.after[info.rd], format)} from shelf ${shelfOf(info)} into box ${registerName(info.rd)}.`);
  }
  if (sentences.length) return sentences;
  if (info.word === 0x00000013) return ["Nothing changed."];
  if (info.rd === 0) return ["This card changes box zero, which never changes, so nothing happened."];
  return [`The machine followed card ${cardNumber(info.pc)}. No box you can see changed.`];
}

/** What the last steps did, in plain sentences (at most `LOG_LIMIT`, the newest), ending at the timeline's position. */
export function narrate(tl: MachineTimeline, format: NumberFormat = "signed"): LogEntry[] {
  const entries: LogEntry[] = [];
  for (let step = Math.max(1, tl.position - LOG_LIMIT + 1); step <= tl.position; step++) {
    const info = tl.stepAt(step);
    if (!info) continue;
    if (info.fault) {
      entries.push({ step, sentences: [`The machine stopped: ${explainFault(info.fault, info.pc, tl.words.length)}`] });
      continue;
    }
    const sentences = sentencesFor(tl, info, step, format);
    if (tl.endHidden && step === tl.length) sentences.push("That was the end of the list.");
    entries.push({ step, sentences });
  }
  return entries;
}
