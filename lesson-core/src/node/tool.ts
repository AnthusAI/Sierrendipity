import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { checkLesson, type LessonReport } from "../check";
import { parseFeature } from "../gherkin/parse";
import { loadLesson, publishLesson } from "../loader";
import { crossCheckGherkin } from "./gherkin-verify";
import { LESSONS_ROOT, listLessonIds, readConcepts, readLessonDir } from "./fs";

export interface ToolResult {
  /** One entry per lesson. */
  lessons: { id: string; ok: boolean; errors: string[]; report?: LessonReport }[];
  ok: boolean;
}

/** Turn a CLI argument (a path, or an id like "c1/01-press-the-button") into a lesson id under root. */
export function lessonIdFromArg(arg: string, root: string = LESSONS_ROOT): string {
  const abs = resolve(arg);
  const rel = relative(root, abs);
  if (!rel.startsWith("..") && rel !== "") return rel.split(sep).join("/");
  return arg.replace(/\/+$/, "");
}

function loadOne(id: string, root: string, concepts: string[] | undefined) {
  const files = readLessonDir(join(root, id));
  const loaded = loadLesson(files, { dir: id, ...(concepts ? { knownConcepts: concepts } : {}) });
  const extra: string[] = [];
  if (files["checks.feature"] !== undefined) {
    try {
      extra.push(...crossCheckGherkin(files["checks.feature"], parseFeature(files["checks.feature"])).map((p) => `checks.feature: ${p}`));
    } catch {
      /* the loader already reported our parse error */
    }
  }
  return { loaded, extra };
}

/** Validate lessons and run their reference solutions. */
export function checkLessons(ids: string[], root: string = LESSONS_ROOT): ToolResult {
  const concepts = readConcepts(root);
  const lessons = ids.map((id) => {
    let outcome: ReturnType<typeof loadOne>;
    try {
      outcome = loadOne(id, root, concepts);
    } catch (e) {
      return { id, ok: false, errors: [`cannot read lesson: ${(e as Error).message}`] };
    }
    const { loaded, extra } = outcome;
    if (!loaded.ok) return { id, ok: false, errors: [...loaded.errors, ...extra] };
    const report = checkLesson(loaded.lesson);
    const errors = [...report.problems, ...extra];
    return { id, ok: errors.length === 0, errors, report };
  });
  return { lessons, ok: lessons.length > 0 && lessons.every((l) => l.ok) };
}

/** Human-readable report lines. */
export function formatResult(result: ToolResult): string[] {
  const out: string[] = [];
  for (const l of result.lessons) {
    out.push(`${l.ok ? "ok  " : "FAIL"} ${l.id}`);
    for (const s of l.report?.solutions ?? []) {
      const stars = s.earned.length ? s.earned.join(", ") : "none";
      out.push(`     ${s.file.padEnd(22)} stars: ${stars.padEnd(24)} steps: ${String(s.steps).padStart(5)}${s.hitStepCap ? " (step cap)" : ""}  cards: ${s.cards}`);
    }
    for (const e of l.errors) out.push(`     error: ${e}`);
  }
  if (result.lessons.length === 0) out.push("FAIL no lessons found");
  return out;
}

/** Write each valid lesson as lessons/dist/<course>-<slug>.json for the browser. */
export function buildLessons(ids: string[], root: string = LESSONS_ROOT): { written: string[]; errors: string[] } {
  const concepts = readConcepts(root);
  const dist = join(root, "dist");
  const written: string[] = [];
  const errors: string[] = [];
  for (const id of ids) {
    let loaded: ReturnType<typeof loadOne>["loaded"];
    try {
      loaded = loadOne(id, root, concepts).loaded;
    } catch (e) {
      errors.push(`${id}: cannot read lesson: ${(e as Error).message}`);
      continue;
    }
    if (!loaded.ok) {
      errors.push(...loaded.errors.map((e) => `${id}: ${e}`));
      continue;
    }
    mkdirSync(dist, { recursive: true });
    const file = join(dist, `${id.replace("/", "-")}.json`);
    writeFileSync(file, JSON.stringify(publishLesson(loaded.lesson)));
    written.push(file);
  }
  return { written, errors };
}

export { listLessonIds };
