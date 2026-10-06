/**
 * A tiny parser for the Gherkin subset used by lesson checks: Feature, Scenario, tags, comments and
 * Given/When/Then/And/But steps. The official @cucumber/gherkin parser is about 219 kB minified
 * (42 kB gzipped) for the browser and does not bundle cleanly, so the browser never parses Gherkin
 * at all (`npm run lessons:build` precompiles it to JSON) and this parser stays under 2 kB. The Node
 * checker cross-validates it against the official parser (see node/gherkin-verify.ts).
 */
export interface FeatureStep {
  keyword: "Given" | "When" | "Then" | "And" | "But";
  text: string;
  line: number;
}
export interface FeatureScenario {
  name: string;
  tags: string[];
  steps: FeatureStep[];
  line: number;
}
export interface Feature {
  name: string;
  tags: string[];
  scenarios: FeatureScenario[];
}

export class GherkinError extends Error {
  constructor(
    public readonly line: number,
    message: string,
  ) {
    super(`line ${line}: ${message}`);
  }
}

const UNSUPPORTED = /^(Background|Scenario Outline|Scenario Template|Examples|Rule|Example)\b/;

export function parseFeature(text: string): Feature {
  const feature: Feature = { name: "", tags: [], scenarios: [] };
  let seenFeature = false;
  let tags: string[] = [];
  let current: FeatureScenario | undefined;

  text.split(/\r\n|\r|\n/).forEach((raw, index) => {
    const line = index + 1;
    const t = raw.trim();
    if (/^#\s*language\s*:/i.test(t)) throw new GherkinError(line, "language headers are not supported (lesson checks are English only)");
    if (t === "" || t.startsWith("#")) return;
    if (t.startsWith("@")) {
      for (const tag of t.split(/\s+/)) {
        if (!/^@[A-Za-z0-9_=.-]+$/.test(tag)) throw new GherkinError(line, `'${tag}' is not a valid tag (separate tags with spaces)`);
        tags.push(tag.slice(1));
      }
      return;
    }
    if (t.startsWith("|") || t.startsWith('"""') || t.startsWith("```")) {
      throw new GherkinError(line, "tables and doc strings are not supported in lesson checks");
    }
    if (UNSUPPORTED.test(t)) throw new GherkinError(line, `'${t.split(":")[0]}' is not supported in lesson checks`);
    let m = /^Feature:\s*(.*)$/.exec(t);
    if (m) {
      if (seenFeature) throw new GherkinError(line, "only one Feature per file");
      seenFeature = true;
      feature.name = m[1]!;
      feature.tags = tags;
      tags = [];
      return;
    }
    m = /^Scenario:\s*(.*)$/.exec(t);
    if (m) {
      if (!seenFeature) throw new GherkinError(line, "a Scenario needs a Feature line first");
      current = { name: m[1]!, tags, steps: [], line };
      tags = [];
      feature.scenarios.push(current);
      return;
    }
    m = /^(Given|When|Then|And|But)\s+(.+)$/.exec(t);
    if (m) {
      if (!current) throw new GherkinError(line, "a step must be inside a Scenario");
      current.steps.push({ keyword: m[1] as FeatureStep["keyword"], text: m[2]!, line });
      return;
    }
    if (!seenFeature) throw new GherkinError(line, "expected a Feature line");
    if (current) throw new GherkinError(line, `unexpected text in a Scenario: '${t}'`);
    // Free-text description under the Feature line: ignored.
  });
  if (!seenFeature) throw new GherkinError(1, "expected a Feature line");
  if (tags.length) throw new GherkinError(text.split(/\r\n|\r|\n/).length, "tags with nothing to tag");
  return feature;
}
