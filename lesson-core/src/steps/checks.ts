import { parseFeature, type Feature } from "../gherkin/parse";
import type { LessonRun } from "./run";
import { parseStep } from "./table";

export interface ScenarioReport {
  name: string;
  tags: string[];
  /** The star this scenario awards: "pass" for @pass, the id of @star=<id> for bonuses. */
  star?: string;
  passed: boolean;
  failures: string[];
}
export interface CheckReport {
  scenarios: ScenarioReport[];
}

/** The star a scenario awards, from its tags. */
export function starOf(tags: string[]): string | undefined {
  if (tags.includes("pass")) return "pass";
  return tags.find((t) => t.startsWith("star="))?.slice(5);
}

/** Run every scenario of a feature (text or already parsed) against a run. Stops a scenario at its first failure. */
export function runChecks(feature: string | Feature, run: LessonRun): CheckReport {
  const f = typeof feature === "string" ? parseFeature(feature) : feature;
  const scenarios = f.scenarios.map((s): ScenarioReport => {
    const failures: string[] = [];
    for (const step of s.steps) {
      const parsed = parseStep(step.text);
      if (!parsed.ok) {
        failures.push(parsed.error);
        break;
      }
      const result = parsed.fn(run);
      if (!result.ok) {
        failures.push(`${step.text}: ${result.message}`);
        break;
      }
    }
    const star = starOf(s.tags);
    return { name: s.name, tags: s.tags, ...(star ? { star } : {}), passed: failures.length === 0, failures };
  });
  return { scenarios };
}

/** Star ids earned by the passing scenarios, in scenario order. */
export function earnedStars(report: CheckReport): string[] {
  return report.scenarios.filter((s) => s.passed && s.star).map((s) => s.star!);
}

/** Static problems in a feature: unknown or malformed step phrases, bonus scenarios without a star. */
export function featureProblems(feature: Feature): string[] {
  const problems: string[] = [];
  const stars = new Set<string>();
  for (const s of feature.scenarios) {
    const star = starOf(s.tags);
    if (s.tags.includes("bonus") && !s.tags.some((t) => t.startsWith("star="))) problems.push(`scenario "${s.name}" is @bonus but has no @star=<id>`);
    if (s.tags.includes("pass") && s.tags.some((t) => t.startsWith("star=") || t === "bonus")) problems.push(`scenario "${s.name}" mixes @pass with @bonus or @star`);
    if (!star && !s.tags.includes("bonus")) problems.push(`scenario "${s.name}" has no @pass or @bonus @star=<id> tag`);
    if (star) {
      if (stars.has(star)) problems.push(`star "${star}" is awarded by more than one scenario`);
      stars.add(star);
    }
    if (s.steps.length === 0) problems.push(`scenario "${s.name}" has no steps`);
    for (const step of s.steps) {
      const parsed = parseStep(step.text);
      if (!parsed.ok) problems.push(`line ${step.line}: ${parsed.error}`);
    }
  }
  return problems;
}
