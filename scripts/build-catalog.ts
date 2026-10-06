// Writes web/public/catalog.json: the small lesson summaries the course path needs (titles, minutes,
// concepts, side rooms, "now you can" lines and warm-ups). The browser fetches it; it never parses YAML.
// Run by `npm run lessons:build` and by the web build's prebuild step.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadLesson } from "../lesson-core/src/loader";
import { listLessonIds, readConcepts, readLessonDir } from "../lesson-core/src/node/fs";

const root = resolve(__dirname, "..");
const lessonsRoot = join(root, "lessons");
const concepts = readConcepts(lessonsRoot);

const lessons = [];
const errors: string[] = [];
for (const id of listLessonIds(lessonsRoot)) {
  const loaded = loadLesson(readLessonDir(join(lessonsRoot, id)), { dir: id, ...(concepts ? { knownConcepts: concepts } : {}) });
  if (!loaded.ok) {
    errors.push(...loaded.errors.map((e) => `${id}: ${e}`));
    continue;
  }
  const l = loaded.lesson;
  lessons.push({ id: l.id, title: l.title, minutes: l.minutes, concepts: l.concepts, nowYouCan: l.nowYouCan, warmups: l.warmups, sideRooms: l.sideRooms });
}

if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  process.exit(1);
}
const out = join(root, "web", "public", "catalog.json");
mkdirSync(join(root, "web", "public"), { recursive: true });
writeFileSync(out, JSON.stringify({ version: 1, lessons }));
console.log(`wrote ${out} (${lessons.length} lessons)`);
