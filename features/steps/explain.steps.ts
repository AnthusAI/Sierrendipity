import { Given, When, Then, After } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildProgram, type ExplainResponse } from "../../runner/src/explain.ts";
import { currentRequest, getResponse, setResponse } from "./runner.steps.ts";

type Instruction = NonNullable<ExplainResponse["instructions"]>[number];

const explained = () => getResponse().body as ExplainResponse;
const instructions = () => explained().instructions ?? [];

function explainBody() {
  const { language, files, optLevel } = currentRequest() as unknown as Record<string, unknown>;
  return { language, files, optLevel };
}

async function postExplain(body: unknown) {
  const res = await fetch(`${process.env.RUNNER_URL}/explain`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

Given("the optimization level {string}", (level: string) => {
  (currentRequest() as unknown as Record<string, unknown>).optLevel = level;
});

Given("a main.c with {int} statements", (count: number) => {
  const body = Array.from({ length: count }, () => "  x++;").join("\n");
  currentRequest().files.push({ path: "main.c", content: `int main(void) {\n  int x = 0;\n${body}\n  return x;\n}\n` });
});

When("the project is explained", async () => {
  setResponse(await postExplain(explainBody()));
});

Then("the program has load address {int}, entry {int}, stack top {int} and memory size {int}", (load, entry, top, size) => {
  const program = explained().program;
  assert.ok(program, "no program");
  assert.deepEqual(
    { loadAddress: program.loadAddress, entry: program.entry, stackTop: program.stackTop, memorySize: program.memorySize },
    { loadAddress: load, entry, stackTop: top, memorySize: size },
  );
});

Then("the program image starts with the word {word}", (hex: string) => {
  const image = Buffer.from(explained().program!.image, "base64");
  assert.equal(image.readUInt32LE(0), Number(hex));
  assert.ok(image.length <= 1024 * 1024);
});

const key = (file: string, line: number) => `${file}:${line}`;

Then("the line map has entries for {string} lines {string}", (file: string, lines: string) => {
  const lineMap = explained().lineMap ?? {};
  for (const line of lines.split(",").map(Number)) {
    const indexes = lineMap[key(file, line)];
    assert.ok(indexes && indexes.length > 0, `no entry for ${key(file, line)}`);
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b));
    for (const index of indexes) {
      const instruction = instructions()[index];
      assert.equal(instruction.origin, "user");
      assert.deepEqual([instruction.src?.path, instruction.src?.line], [file, line]);
    }
  }
});

Then("the line map has no entries for {string} line {int}", (file: string, line: number) => {
  assert.equal((explained().lineMap ?? {})[key(file, line)], undefined);
});

const ofFunction = (name: string) => instructions().filter((i) => i.function === name);

Then("the instructions of function {string} have origin {string}", (name: string, origin: string) => {
  const found = ofFunction(name);
  assert.ok(found.length > 0, `no instructions for ${name}`);
  assert.ok(found.every((i) => i.origin === origin));
});

Then("the instructions of function {string} come from the file {string}", (name: string, file: string) => {
  const found = ofFunction(name).filter((i) => i.src);
  assert.ok(found.length > 0, `no mapped instructions for ${name}`);
  assert.ok(found.every((i) => i.src!.path === file), JSON.stringify(found.find((i) => i.src!.path !== file)));
});

Then("no instruction names a temporary path", () => {
  for (const i of instructions()) {
    if (i.src) assert.ok(!path.isAbsolute(i.src.path) && !/sierrendipity-|\/tmp\//.test(i.src.path), i.src.path);
  }
  assert.ok(!JSON.stringify(Object.keys(explained().lineMap ?? {})).match(/sierrendipity-|\/tmp\//));
});

Then("the compile output has no temporary paths", () => {
  assert.ok(!/sierrendipity-|\/tmp\//.test(explained().compileOutput), explained().compileOutput);
});

Then("the compile output mentions {string}", (text: string) => {
  assert.ok(explained().compileOutput.includes(text), explained().compileOutput);
});

Then("there is no program and no instruction list", () => {
  const body = explained();
  assert.equal(body.program, undefined);
  assert.equal(body.instructions, undefined);
  assert.equal(body.lineMap, undefined);
});

function groups(indexes: number[]): number[][] {
  const out: number[][] = [];
  for (const i of indexes) {
    const last = out[out.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else out.push([i]);
  }
  return out;
}

Then("the line {string} maps to more than one group of consecutive instructions", (line: string) => {
  const indexes = (explained().lineMap ?? {})[line];
  assert.ok(indexes, `no entry for ${line}`);
  assert.ok(groups(indexes).length > 1, JSON.stringify(indexes));
});

Then("the instructions of the line {string} do not all have the same column", (line: string) => {
  const columns = new Set((explained().lineMap ?? {})[line].map((i) => instructions()[i].src!.column));
  assert.ok(columns.size > 1, JSON.stringify([...columns]));
});

Then("the instruction count differs from an {string} build of the same project", async (level: string) => {
  const other = await postExplain({ ...explainBody(), optLevel: level });
  assert.equal((other.body as ExplainResponse).status, "ok");
  assert.notEqual(instructions().length, (other.body as ExplainResponse).instructions!.length);
});

// The first and last instruction of a function must carry the very words `objdump -d` prints for the
// same addresses of a separately linked build of the project.
Then("the instruction words at the first and the last instruction of {string} match objdump", async (name: string) => {
  const dir = await mkdtemp(path.join(tmpdir(), "explain-spec-"));
  try {
    const built = await buildProgram(currentRequest().files, "O0", dir);
    assert.equal(built.status, "ok", built.output);
    const dump = execFileSync("riscv64-unknown-elf-objdump", ["-d", built.elf!], { maxBuffer: 20_000_000 }).toString();
    const words = new Map<number, number>();
    for (const m of dump.matchAll(/^\s*([0-9a-f]+):\s+([0-9a-f]{8})\s/gm)) words.set(parseInt(m[1], 16), parseInt(m[2], 16));
    const found = ofFunction(name);
    for (const i of [found[0], found[found.length - 1]] as Instruction[]) {
      assert.equal(i.word, words.get(i.addr), `word at 0x${i.addr.toString(16)}`);
    }
    assert.notEqual(found[0].word, found[found.length - 1].word);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// qemu-user cannot map guest address 0, so the project is re-linked with RAM at 0x10000. The code is
// built by the same compile and link steps, and is the same program apart from its base address.
let emulated: { output: string; code: number | null };

When("the project is built and run in an emulator", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "explain-spec-"));
  try {
    const script = (await readFile(path.join(__dirname, "../../runner/riscv/link.ld"), "utf8")).replace("ORIGIN = 0,", "ORIGIN = 0x10000,");
    assert.match(script, /0x10000/);
    const linkScript = path.join(dir, "high.ld");
    await writeFile(linkScript, script);
    const built = await buildProgram(currentRequest().files, "O0", dir, undefined, { linkScript });
    assert.equal(built.status, "ok", built.output);
    const stdin = (currentRequest().stdin ?? "").replace(/\\n/g, "\n");
    const ran = spawnSync("qemu-riscv32", [built.elf!], { input: stdin, timeout: 20_000 });
    emulated = { output: ran.stdout.toString(), code: ran.status };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

Then("the emulated output is {string}", (output: string) => {
  assert.equal(emulated.output, output.replace(/\\n/g, "\n"));
});

Then("the emulated exit code is {int}", (code: number) => {
  assert.equal(emulated.code, code);
});

After(() => {
  emulated = { output: "", code: null };
});
