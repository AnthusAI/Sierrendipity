import { describe, registerName } from "@sierrendipity/explorer";
import { registerIndex, type MachineTimeline } from "./useMachineTimeline";

export type NumberFormat = "signed" | "unsigned";

/** The blank shown in a box nothing has been put in yet. */
export const BLANK = "–";

export const formatValue = (value: number, format: NumberFormat = "signed") => String(format === "signed" ? value | 0 : value >>> 0);

/** The plain words of the card at `index` in the boxes vocabulary. */
export const cardText = (word: number, index: number) => describe(word, { vocabulary: "boxes", pc: index * 4 }).text;

export interface LogEntry {
  step: number;
  /** The sentences of the step, e.g. "Box a0 changed from – to 5." */
  sentences: string[];
  /** Registers (of the visible boxes) this step wrote. */
  changed: string[];
}

/** What each visible step did, in plain sentences, from step 1 up to the timeline's position. */
export function narrate(tl: MachineTimeline, format: NumberFormat = "signed"): LogEntry[] {
  const seen = new Set<number>();
  const entries: LogEntry[] = [];
  for (let step = 1; step <= tl.position; step++) {
    const info = tl.stepAt(step);
    if (!info) continue;
    const sentences: string[] = [];
    const changed: string[] = [];
    for (const name of tl.boxes) {
      const reg = registerIndex(name);
      if (info.rd !== reg || reg === 0) continue;
      changed.push(name);
      const before = info.before[reg];
      const after = info.after[reg];
      const was = seen.has(reg) ? formatValue(before, format) : BLANK;
      sentences.push(
        seen.has(reg) && before === after
          ? `Box ${name} was set to ${formatValue(after, format)} again; it already held that.`
          : `Box ${name} changed from ${was} to ${formatValue(after, format)}.`,
      );
    }
    if (info.rd) seen.add(info.rd);
    if (!sentences.length) sentences.push(`The machine followed card ${info.pc / 4 + 1}. No box you can see changed.`);
    if (tl.hideEnd && step === tl.length) sentences.push("That was the end of the list.");
    entries.push({ step, sentences, changed });
  }
  return entries;
}

/** Register index to its box name, for labels. */
export const boxName = (reg: number) => registerName(reg);
