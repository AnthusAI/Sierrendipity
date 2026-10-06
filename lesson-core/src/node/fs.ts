import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { parse as parseYaml } from "yaml";

/** The lessons/ directory, relative to the repository root where npm scripts and Cucumber run. */
export const LESSONS_ROOT = resolve(process.cwd(), "lessons");

/** Read a lesson directory into the in-memory file map the loader takes (relative names, text). */
export function readLessonDir(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[relative(dir, full).split(sep).join("/")] = readFileSync(full, "utf8");
    }
  };
  walk(dir);
  return files;
}

/** Lesson directories as ids like "c1/01-wake", sorted. A lesson directory contains lesson.yaml. */
export function listLessonIds(root: string = LESSONS_ROOT): string[] {
  const ids: string[] = [];
  if (!existsSync(root)) return ids;
  for (const course of readdirSync(root).sort()) {
    const courseDir = join(root, course);
    if (!statSync(courseDir).isDirectory() || course === "dist") continue;
    for (const lesson of readdirSync(courseDir).sort()) {
      if (existsSync(join(courseDir, lesson, "lesson.yaml"))) ids.push(`${course}/${lesson}`);
    }
  }
  return ids;
}

/** Concept ids from lessons/concepts.yaml (`concepts: [{id, title}]`). */
/** Returns undefined when there is no registry file (concepts are then not validated). */
export function readConcepts(root: string = LESSONS_ROOT): string[] | undefined {
  const file = join(root, "concepts.yaml");
  if (!existsSync(file)) return undefined;
  const doc = parseYaml(readFileSync(file, "utf8")) as { concepts?: { id: string }[] } | null;
  return (doc?.concepts ?? []).map((c) => c.id);
}
