import type { Lesson } from "./lesson";
import { earnedStars, runChecks, starOf } from "./steps/checks";
import { DEFAULT_MAX_STEPS, registerNumber, runProgram } from "./steps/run";

export interface SolutionReport {
  file: string;
  declared: string[];
  earned: string[];
  steps: number;
  cards: number;
  hitStepCap: boolean;
  problems: string[];
}
export interface LessonReport {
  id: string;
  solutions: SolutionReport[];
  problems: string[];
  ok: boolean;
}

const same = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const list = (a: string[]): string => (a.length ? a.join(", ") : "nothing");

/** Run every reference solution and warm-up of a loaded lesson and compare with what it declares. */
export function checkLesson(lesson: Lesson): LessonReport {
  const problems: string[] = [];
  if (!lesson.checks.scenarios.some((s) => s.tags.includes("pass"))) problems.push("the lesson has no @pass scenario");

  const declaredStars = new Set(lesson.solutions.flatMap((d) => d.earns));
  if (!declaredStars.has("pass")) problems.push("no solution is declared to earn pass");
  for (const sc of lesson.checks.scenarios) {
    const star = starOf(sc.tags);
    if (star && star !== "pass" && !declaredStars.has(star)) problems.push(`no solution is declared to earn the bonus "${star}"`);
  }
  if (!lesson.solutions.some((d) => d.earns.length === 0 && !d.capped)) problems.push("solutions need at least one wrong solution (earns: [] and not capped)");

  const solutions = lesson.solutions.map((decl): SolutionReport => {
    const run = runProgram(decl.words, {
      ...(decl.stdin !== undefined ? { stdin: decl.stdin } : {}),
      maxSteps: decl.maxSteps ?? DEFAULT_MAX_STEPS,
      predictions: decl.predictions,
      starter: lesson.starter.words,
    });
    const report = runChecks(lesson.checks, run);
    const earned = earnedStars(report);
    const out: string[] = [];
    if (!same(earned, decl.earns)) {
      const extra = earned.filter((s) => !decl.earns.includes(s));
      const missing = decl.earns.filter((s) => !earned.includes(s));
      if (decl.earns.length === 0 && earned.includes("pass")) out.push("a wrong solution passes: it is declared to earn nothing but earns pass");
      else if (decl.earns.includes("pass") && !earned.includes("pass")) {
        out.push(`declared to pass but fails @pass: ${report.scenarios.find((s) => s.tags.includes("pass"))?.failures[0] ?? "unknown"}`);
      }
      out.push(`earns ${list(earned)} but is declared to earn ${list(decl.earns)}${extra.length ? `; unexpected: ${extra.join(", ")}` : ""}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`);
    }
    if (decl.capped && !run.hitStepCap) out.push(`declared capped (never terminating) but stopped by itself after ${run.steps} steps (${run.machine.state})`);
    if (!decl.capped && run.hitStepCap) out.push(`was stopped by the step cap after ${run.steps} steps but is not declared capped`);
    return { file: decl.file, declared: decl.earns, earned, steps: run.steps, cards: decl.words.length, hitStepCap: run.hitStepCap, problems: out };
  });

  for (const w of lesson.warmups) {
    const run = runProgram(w.program.words, w.startRegs ? { startRegs: w.startRegs } : {});
    const index = registerNumber(w.target);
    const have = index === undefined ? undefined : run.machine.regs[index]! | 0;
    if (run.hitStepCap || run.machine.state !== "halted") problems.push(`warmup "${w.id}": the program does not halt (${run.machine.state})`);
    else if (have !== (w.expected | 0)) problems.push(`warmup "${w.id}": ${w.target} holds ${have} but expected is ${w.expected}`);
  }

  for (const s of solutions) for (const p of s.problems) problems.push(`${s.file}: ${p}`);
  return { id: lesson.id, solutions, problems, ok: problems.length === 0 };
}
