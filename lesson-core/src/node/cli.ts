import { LESSONS_ROOT } from "./fs";
import { buildLessons, checkLessons, formatResult, lessonIdFromArg, listLessonIds } from "./tool";

const USAGE = `usage: npm run lesson -- check <lesson-dir | --all>
       npm run lessons:build              (writes lessons/dist/*.json)`;

/** Returns the process exit code. */
export function main(argv: string[], log: (line: string) => void = console.log, root: string = LESSONS_ROOT): number {
  const [command, target] = argv;
  if ((command !== "check" && command !== "build") || !target) {
    log(USAGE);
    return 2;
  }
  const ids = target === "--all" ? listLessonIds(root) : [lessonIdFromArg(target, root)];
  if (command === "check") {
    const result = checkLessons(ids, root);
    for (const line of formatResult(result)) log(line);
    return result.ok ? 0 : 1;
  }
  const { written, errors } = buildLessons(ids, root);
  for (const w of written) log(`wrote ${w}`);
  for (const e of errors) log(`error: ${e}`);
  return errors.length || written.length === 0 ? 1 : 0;
}

if (process.argv[1] && /cli\.ts$/.test(process.argv[1])) process.exitCode = main(process.argv.slice(2));
