import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator, SourceMediaType } from "@cucumber/messages";
import { parseFeature, type Feature } from "../gherkin/parse";

/**
 * Parse a feature with the official @cucumber/gherkin parser and compare it with our tiny parser.
 * Returns the differences (empty when they agree). Node only: the official parser is not shipped to
 * the browser (see docs/lesson-format.md).
 */
export function crossCheckGherkin(text: string, ours: Feature = parseFeature(text)): string[] {
  const problems: string[] = [];
  const messages = generateMessages(text, "checks.feature", SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN, {
    includeSource: false,
    includeGherkinDocument: true,
    includePickles: false,
    newId: IdGenerator.uuid(),
  });
  for (const m of messages) if (m.parseError) problems.push(`official Gherkin parser: ${m.parseError.message}`);
  const feature = messages.find((m) => m.gherkinDocument)?.gherkinDocument?.feature;
  if (!feature) return problems.length ? problems : ["official Gherkin parser found no Feature"];

  const scenarios = feature.children.flatMap((c) => (c.scenario ? [c.scenario] : []));
  if (feature.name !== ours.name) problems.push(`feature name differs: "${feature.name}" vs "${ours.name}"`);
  if (scenarios.length !== ours.scenarios.length) problems.push(`scenario count differs: ${scenarios.length} vs ${ours.scenarios.length}`);
  scenarios.forEach((s, i) => {
    const o = ours.scenarios[i];
    if (!o) return;
    if (s.name !== o.name) problems.push(`scenario ${i + 1} name differs: "${s.name}" vs "${o.name}"`);
    const tags = s.tags.map((t) => t.name.slice(1));
    if (tags.join() !== o.tags.join()) problems.push(`scenario "${s.name}" tags differ: ${tags.join()} vs ${o.tags.join()}`);
    const steps = s.steps.map((x) => x.text);
    if (steps.join("\n") !== o.steps.map((x) => x.text).join("\n")) problems.push(`scenario "${s.name}" steps differ`);
  });
  return problems;
}
