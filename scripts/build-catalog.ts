// Writes web/public/catalog.json: the small lesson summaries the course path needs (titles, minutes,
// concepts, side rooms, "now you can" lines and warm-ups). The browser fetches it; it never parses YAML.
// Draft lessons (`draft: true`) are left out: they are playable only with ?draft=1 in dev and test builds.
// Run by `npm run lessons:build` and by the web build's prebuild step.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildCatalog } from "../lesson-core/src/node/tool";

const root = resolve(__dirname, "..");
const { lessons, errors } = buildCatalog(join(root, "lessons"));

if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
const out = join(root, "web", "public", "catalog.json");
mkdirSync(join(root, "web", "public"), { recursive: true });
writeFileSync(out, JSON.stringify({ version: 1, lessons }));
console.log(`wrote ${out} (${lessons.length} lessons)`);
