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
  const { language, files, optLevel, checks } = currentRequest() as unknown as Record<string, unknown>;
  return { language, files, optLevel, checks };
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

Given("a file named with {int} characters ending in {string}", (length: number, ext: string) => {
  currentRequest().files.push({ path: "a".repeat(length - ext.length) + ext, content: "int main(void) { return 0; }\n" });
});

// main.c holds a long run of nops in a function symbol; b.c appends a valid DWARF 4 line unit made of
// many one-row sequences. Scanning every sequence for every instruction was quadratic.
Given("a project whose debug line table has {int} sequences", (count: number) => {
  const files = currentRequest().files;
  files.push({
    path: "main.c",
    content:
      '__asm__(".text\\n.type big,@function\\nbig:\\n.rept 15000\\nnop\\n.endr\\n.size big,.-big");\n' +
      "int zz(void);\nint main(void) { return zz(); }\n",
  });
  files.push({
    path: "b.c",
    content:
      '__asm__(".section .debug_line,\\"\\",@progbits\\n.4byte 2f-1f\\n1:\\n.2byte 4\\n.4byte 4f-3f\\n3:\\n' +
      ".byte 1,1,1,-5,14,13\\n.byte 0,1,1,1,1,0,0,0,1,0,0,1\\n.byte 0\\n.asciz \\\"b.c\\\"\\n.byte 0,0,0,0\\n4:\\n" +
      `.rept ${count}\\n.byte 1,0,1,1\\n.endr\\n2:\\n.text\\n");\n` +
      '__asm__(".text\\n.globl zz\\n.type zz,@function\\nzz: li a0,1\\nret\\n.size zz,.-zz");\n',
  });
});

let timing: { total: number; worstHealth: number };

When("the project is explained while health checks are polled", async () => {
  const started = Date.now();
  let worst = 0;
  let polling = true;
  const poll = (async () => {
    while (polling) {
      const t = Date.now();
      await fetch(`${process.env.RUNNER_URL}/healthz`);
      worst = Math.max(worst, Date.now() - t);
      await new Promise((r) => setTimeout(r, 100));
    }
  })();
  setResponse(await postExplain(explainBody()));
  timing = { total: Date.now() - started, worstHealth: worst };
  polling = false;
  await poll;
});

Then("the request completed within {int} seconds", (seconds: number) => {
  assert.ok(timing.total < seconds * 1000, `took ${timing.total} ms`);
});

Then("every health check was answered within {int} seconds", (seconds: number) => {
  assert.ok(timing.worstHealth < seconds * 1000, `worst ${timing.worstHealth} ms`);
});

Then("every instruction address is unique, ascending and 4-aligned", () => {
  const list = instructions();
  assert.ok(list.length > 0);
  list.forEach((i, n) => {
    assert.equal(i.addr % 4, 0, `0x${i.addr.toString(16)}`);
    if (n > 0) assert.ok(i.addr > list[n - 1].addr, `0x${i.addr.toString(16)} after 0x${list[n - 1].addr.toString(16)}`);
  });
});

Then("no instruction belongs to the function {string}", (name: string) => {
  assert.equal(ofFunction(name).length, 0);
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
