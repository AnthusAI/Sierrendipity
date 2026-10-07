import type { Lesson } from "./lesson";

/**
 * Lesson text follows ASD-STE100 (Simplified Technical English). A program cannot check the whole standard,
 * so this checks what a program can: short sentences, no contractions, no words the standard avoids for a
 * beginner, and no idioms. Authors keep to the rest by hand (active voice, one idea per sentence, one word
 * for one thing: "card", "box", "number", "instruction", "Run").
 */
export const STE_MAX_WORDS_PER_SENTENCE = 20;

/** Words and phrases that are vague, informal or unclear for a reader who is new to the subject. */
const AVOID: [RegExp, string][] = [
  [/\bspin(?:ner|ning|s)?\b/i, 'use "change"'],
  [/\btiny\b/i, 'say "small"'],
  [/\bjust\b/i, 'delete "just" or say "only"'],
  [/\bsimply\b|\beasily\b|\bquickly\b/i, "delete the adverb"],
  [/\bpretty (?:much|good|easy)\b|\bkind of\b|\bsort of\b/i, "say exactly what you mean"],
  [/\bpress\b/i, 'use "select" for a button on the screen'],
  [/\bclick\b|\btap\b/i, 'use "select" for a button on the screen'],
  [/\bbasically\b|\bobviously\b|\bof course\b/i, "delete it"],
  [/\bthat is all\b|\bthat's all\b/i, "say what the thing is"],
  [/\bget\b|\bgets\b|\bgot\b/i, 'use a precise verb ("receive", "become", "make")'],
];

const CONTRACTION = /\b\w+(?:n't|'re|'ve|'ll|'m|'d)\b|\b(?:it|that|let|here|there|what|who|he|she)'s\b/i;

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** The sentences of a text, split at ending punctuation. */
function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter(Boolean);
}

/** The problems in one piece of lesson text, each as a short message. */
export function steProblems(text: string): string[] {
  const problems: string[] = [];
  for (const sentence of sentencesOf(text)) {
    const n = words(sentence);
    if (n > STE_MAX_WORDS_PER_SENTENCE) problems.push(`a sentence has ${n} words (at most ${STE_MAX_WORDS_PER_SENTENCE}): "${sentence}"`);
  }
  const contraction = text.match(CONTRACTION);
  if (contraction) problems.push(`"${contraction[0]}" is a contraction: write the full words`);
  for (const [pattern, advice] of AVOID) {
    const hit = text.match(pattern);
    if (hit) problems.push(`"${hit[0]}": ${advice}`);
  }
  return problems;
}

/** Every piece of text the student reads, with where it is, for the checker. */
export function studentText(lesson: Lesson): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined) => text && out.push({ where, text });
  lesson.scenes.forEach((scene) => {
    const w = `scene "${scene.id}"`;
    add(`${w} say`, scene.say);
    add(`${w} doneSay`, scene.doneSay);
    add(`${w} ifMissed`, scene.ifMissed);
    scene.hints.forEach((h, k) => add(`${w} hint ${k + 1}`, h));
    scene.onWrong.forEach((o, k) => add(`${w} onWrong[${k}]`, o.say));
    add(`${w} ask question`, scene.ask?.question);
    if (scene.ask?.kind === "choice") scene.ask.choices.forEach((c, k) => add(`${w} ask choice ${k + 1}`, c));
  });
  add("onWrongDefault", lesson.onWrongDefault);
  lesson.nowYouCan.forEach((t, k) => add(`nowYouCan[${k}]`, t));
  lesson.warmups.forEach((wu) => add(`warmup "${wu.id}" question`, wu.question));
  return out;
}

/** All the Simplified Technical English problems in a lesson, one message each. */
export function lessonSteProblems(lesson: Lesson): string[] {
  return studentText(lesson).flatMap(({ where, text }) => steProblems(text).map((p) => `${where}: ${p}`));
}
