import { Given, When, Then, After } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { ExplainResponse } from "../../runner/src/explain.ts";
import { Machine } from "../../explorer/src/index.ts";
import { currentRequest, getResponse, setResponse } from "./runner.steps.ts";

const explained = () => getResponse().body as ExplainResponse;
const instructions = () => explained().instructions ?? [];
const request = () => currentRequest() as unknown as Record<string, unknown>;

async function postExplain(body: unknown) {
  const res = await fetch(`${process.env.RUNNER_URL}/explain`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as ExplainResponse };
}

const explainBody = (overrides: Record<string, unknown> = {}) => {
  const { language, files, optLevel, checks } = request();
  return { language, files, optLevel, checks, ...overrides };
};

Given("safety checks are on", () => {
  request().checks = true;
});

Given("the request field {string} set to the JSON {}", (field: string, json: string) => {
  request()[field] = JSON.parse(json);
});

Given("a main.rs with {int} tiny modules", (count: number) => {
  const mods = Array.from({ length: count }, (_, i) => `mod m${i} { pub fn f() -> u32 { ${i} } }`).join("\n");
  currentRequest().files.push({ path: "main.rs", content: `${mods}\nfn main() { println!("{}", m1::f()); }\n` });
});

Given("a main.rs with a string literal of {int} bytes", (size: number) => {
  currentRequest().files.push({
    path: "main.rs",
    content: `static S: &str = "${"a".repeat(size)}";\nfn main() { println!("{}", S.len()); }\n`,
  });
});

// A long run of nops in a function symbol, plus a valid DWARF 4 line unit made of many one-row sequences
// written by global_asm!: scanning every sequence for every instruction would be quadratic.
Given("a Rust project whose debug line table has {int} sequences", (count: number) => {
  const asm = [
    '".text"',
    '".globl big"',
    '".type big,@function"',
    '"big:"',
    '".rept 15000"',
    '"nop"',
    '".endr"',
    '"ret"',
    '".size big,.-big"',
    '".section .debug_line,\\"\\",@progbits"',
    '".4byte 2f-1f"',
    '"1:"',
    '".2byte 4"',
    '".4byte 4f-3f"',
    '"3:"',
    '".byte 1,1,1,-5,14,13"',
    '".byte 0,1,1,1,1,0,0,0,1,0,0,1"',
    '".byte 0"',
    '".asciz \\"main.rs\\""',
    '".byte 0,0,0,0"',
    '"4:"',
    `".rept ${count}"`,
    '".byte 1,0,1,1"',
    '".endr"',
    '"2:"',
    '".text"',
  ].join(",\n    ");
  currentRequest().files.push({
    path: "main.rs",
    content:
      `core::arch::global_asm!(\n    ${asm}\n);\nextern "C" { fn big(); }\nfn main() { unsafe { big(); } }\n`,
  });
});

// ---- running the returned image in the real explorer Machine ----
let ran: { out: string; err: string; code: number | null; state: string; fault: string | null };

function runImage(response: ExplainResponse, stdin: string) {
  const program = response.program;
  assert.ok(program, `no program: ${response.status}\n${response.compileOutput}`);
  const decoder = new TextDecoder();
  let out = "";
  let err = "";
  const machine = new Machine({
    memorySize: program.memorySize,
    stackTop: program.stackTop,
    io: {
      write: (fd, bytes) => {
        if (fd === 1) out += decoder.decode(bytes, { stream: true });
        else if (fd === 2) err += decoder.decode(bytes, { stream: true });
      },
      read: () => null,
    },
  });
  machine.load(Buffer.from(program.image, "base64"), program.loadAddress, program.entry);
  machine.provideInput(Buffer.from(stdin));
  machine.provideInput(new Uint8Array(0)); // end of input after the text
  machine.run(20_000_000);
  ran = { out, err, code: machine.exitCode, state: machine.state, fault: machine.fault };
}

When("the project is explained and run in the explorer", async () => {
  const response = (await postExplain(explainBody())).body;
  setResponse({ status: 200, body: response });
  runImage(response, (currentRequest().stdin ?? "").replace(/\\n/g, "\n"));
});

Then("the explorer output is {string}", (text: string) => {
  assert.equal(ran.out, text.replace(/\\n/g, "\n"), `state ${ran.state} ${ran.fault ?? ""} err ${ran.err}`);
});

Then("the explorer error output is {string}", (text: string) => {
  assert.equal(ran.err, text.replace(/\\n/g, "\n"));
});

Then("the explorer error output contains {string}", (text: string) => {
  assert.ok(ran.err.includes(text.replace(/\\n/g, "\n")), `${ran.err} (state ${ran.state} ${ran.fault ?? ""})`);
});

Then("the explorer exit code is {int}", (code: number) => {
  assert.equal(ran.code, code, `state ${ran.state} ${ran.fault ?? ""} err ${ran.err}`);
});

After(() => {
  ran = { out: "", err: "", code: null, state: "", fault: null };
});

// ---- the instruction list ----
const ofFunction = (name: string) => instructions().filter((i) => i.function === name);

Then("some instructions have origin {string}", (origin: string) => {
  assert.ok(instructions().some((i) => i.origin === origin));
});

Then("the function {string} has fewer than {int} instructions", (name: string, count: number) => {
  const n = ofFunction(name).length;
  assert.ok(n > 0 && n < count, `${name}: ${n} instructions`);
});

Then("some instructions of a function in {string} have origin {string}", (crate: string, origin: string) => {
  assert.ok(
    instructions().some((i) => i.function.includes(`${crate}::`) && i.origin === origin),
    [...new Set(instructions().map((i) => i.function))].join("\n"),
  );
});

Then("the instructions of those functions have no line map entries", () => {
  const mapped = new Set(Object.values(explained().lineMap ?? {}).flat());
  const core = instructions().filter((i) => i.function.includes("core::"));
  assert.ok(core.length > 0);
  assert.ok(core.every((i) => !mapped.has(i.index) && i.src === undefined));
});

Then("the instruction function names include {string}", (name: string) => {
  const names = [...new Set(instructions().map((i) => i.function))];
  assert.ok(names.includes(name), names.join("\n"));
});

Then("no instruction function name looks mangled or carries a hash", () => {
  for (const name of new Set(instructions().map((i) => i.function))) {
    assert.ok(!/^_R|^_ZN|17h[0-9a-f]{16}|::h[0-9a-f]{16}/.test(name), name);
  }
});

Then("the instruction count differs from a build of the same project with safety checks off", async () => {
  const other = (await postExplain(explainBody({ checks: false }))).body;
  assert.equal(other.status, "ok", other.compileOutput);
  assert.ok(instructions().length > other.instructions!.length, `${instructions().length} vs ${other.instructions!.length}`);
});

Then("the instructions of the line {string} include more than the same line without safety checks", async (line: string) => {
  const other = (await postExplain(explainBody({ checks: false }))).body;
  const checked = (explained().lineMap ?? {})[line]?.length ?? 0;
  const plain = (other.lineMap ?? {})[line]?.length ?? 0;
  assert.ok(checked > plain && plain > 0, `${checked} vs ${plain}`);
  for (const index of explained().lineMap![line]) assert.equal(instructions()[index].origin, "user");
});

// ---- the sequence of failing explains ----
let sequence: { body: ExplainResponse; ms: number }[];

When("the project is explained {int} times in a row", async (count: number) => {
  sequence = [];
  for (let i = 0; i < count; i++) {
    const started = Date.now();
    sequence.push({ body: (await postExplain(explainBody())).body, ms: Date.now() - started });
  }
});

Then("every explain finished with status {string} in under {int} seconds", (status: string, seconds: number) => {
  for (const { body, ms } of sequence) {
    assert.equal(body.status, status);
    assert.ok(ms < (seconds * 1000) / sequence.length + 10_000, `${ms} ms`);
  }
});
