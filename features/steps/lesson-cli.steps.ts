import { After, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildCatalog, main } from "@sierrendipity/lesson-core/node";
import { validTestLesson } from "./lesson-fixtures";

let scratch: string | undefined;
let output: string[];
let exitCode: number;

After(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});

Given("a scratch lessons folder holding the valid test lesson as {string}", (id: string) => {
  scratch = mkdtempSync(join(tmpdir(), "lesson-cli-"));
  for (const [name, text] of Object.entries(validTestLesson())) {
    const file = join(scratch, id, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  writeFileSync(join(scratch, "concepts.yaml"), "concepts:\n  - { id: machine, title: Machine }\n");
});
Given("in the scratch lesson {string} is replaced {string} with {string}", (name: string, find: string, replace: string) => {
  const file = join(scratch!, "c1/99-test", name);
  const text = readFileSync(file, "utf8");
  assert.ok(text.includes(find), `${name} does not contain ${find}`);
  writeFileSync(file, text.replace(find, () => replace.replace(/\\n/g, "\n")));
});

When("I run the lesson CLI with {string}", (args: string) => {
  output = [];
  exitCode = main(args.split(" "), (l) => output.push(l));
});
When("I run the lesson CLI on the scratch folder with {string}", (args: string) => {
  output = [];
  exitCode = main(args.split(" "), (l) => output.push(l), scratch);
});
When("I build the scratch lessons", () => {
  output = [];
  exitCode = main(["build", "--all"], (l) => output.push(l), scratch);
  assert.equal(exitCode, 0, output.join("\n"));
});

// Drafts and the catalog

let catalog: { lessons: { id: string }[]; errors: string[] };
When("I build the catalog of the scratch lessons", () => {
  catalog = buildCatalog(scratch!);
});
When("I build the catalog of the real lessons", () => {
  catalog = buildCatalog();
});
Then("that draft file is a published lesson that is a draft", () => {
  assert.equal(JSON.parse(readFileSync(join(scratch!, "dist/drafts/c1-99-test.json"), "utf8")).draft, true);
});
Then("the file {string} does not exist in the scratch folder", (name: string) => assert.ok(!existsSync(join(scratch!, name))));
Then("the catalog lists no lessons", () => assert.deepEqual(catalog.lessons, []));
Then("the catalog build reports no errors", () => assert.deepEqual(catalog.errors, []));
Then("the catalog lists the lesson {string}", (id: string) => assert.ok(catalog.lessons.some((l) => l.id === id), JSON.stringify(catalog.lessons.map((l) => l.id))));
Then("the catalog does not list the lesson {string}", (id: string) => assert.ok(!catalog.lessons.some((l) => l.id === id)));

Then("the CLI exits with {int}", (code: number) => assert.equal(exitCode, code, output.join("\n")));
Then("the CLI output mentions {string}", (text: string) => assert.ok(output.join("\n").includes(text), output.join("\n")));
Then("the file {string} exists in the scratch folder", (name: string) => assert.ok(existsSync(join(scratch!, name))));
Then("that file is a published lesson whose checks are data", () => {
  const json = JSON.parse(readFileSync(join(scratch!, "dist/c1-99-test.json"), "utf8"));
  assert.equal(json.format, 1);
  assert.equal(json.id, "c1/99-test");
  assert.equal(typeof json.checks, "object");
  assert.equal(json.checks.scenarios.length, 2);
  assert.equal("solutions" in json, false);
});
