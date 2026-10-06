import { Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { WebWorld } from "../support/web-world.ts";

const exact = (text: string) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
const tab = (w: WebWorld, name: string) => w.page.getByRole("tab", { name, exact: true });
const status = (w: WebWorld) => w.page.getByRole("status", { name: "Machine status" });

// Replace the editor text by pasting it: typing would trigger auto-indent and auto-closing brackets.
async function pasteIntoEditor(w: WebWorld, text: string) {
  await w.page.locator('.editor[data-ready="true"] .monaco-editor').first().click();
  await w.page.keyboard.press("ControlOrMeta+a");
  await w.page.keyboard.press("Backspace");
  await w.page.evaluate(
    `((value) => {
      const area = document.querySelector(".monaco-editor textarea");
      const data = new DataTransfer();
      data.setData("text/plain", value);
      area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    })(${JSON.stringify(text)})`,
  );
}

When("I paste this into the editor:", async function (this: WebWorld, text: string) {
  await pasteIntoEditor(this, text);
});

Given(
  "a project {string} in {word} {word} with the program:",
  async function (this: WebWorld, name: string, a: string, b: string, text: string) {
    this.page.once("dialog", (dialog) => dialog.accept(name));
    await this.page.getByRole("button", { name: "New project", exact: true }).click();
    await this.page.getByLabel("Language").selectOption({ label: `${a} ${b}` });
    await pasteIntoEditor(this, text);
  },
);

Then("the problems list shows {string}", async function (this: WebWorld, text: string) {
  await this.page.getByRole("region", { name: "Problems" }).filter({ hasText: text }).waitFor();
});

Then("the editor marks an error", async function (this: WebWorld) {
  await this.page.locator(".monaco-editor .squiggly-error").first().waitFor();
});

When("I open the {string} tab", async function (this: WebWorld, name: string) {
  await tab(this, name).click();
});

When("I focus the {string} tab and press {string}", async function (this: WebWorld, name: string, key: string) {
  await tab(this, name).focus();
  await this.page.keyboard.press(key);
});

Then("the {string} tab is selected", async function (this: WebWorld, name: string) {
  await this.page.locator("[role=tab][aria-selected=true]").filter({ hasText: exact(name) }).waitFor();
});

Then("the PC is {word}", async function (this: WebWorld, pc: string) {
  await this.page.getByLabel("PC", { exact: true }).filter({ hasText: pc }).waitFor();
});

const register = (w: WebWorld, name: string) => w.page.locator(`tr[data-reg="${name}"]`);

Then("register {word} is {word} and marked changed", async function (this: WebWorld, name: string, value: string) {
  const row = register(this, name).and(this.page.locator('[data-changed="true"]'));
  await row.filter({ hasText: value }).waitFor();
  await row.getByText("changed", { exact: true }).waitFor();
});

Then("register {word} is {word}", async function (this: WebWorld, name: string, value: string) {
  await register(this, name).filter({ hasText: value }).waitFor();
});

Then("register {word} is not marked changed", async function (this: WebWorld, name: string) {
  await register(this, name).and(this.page.locator('[data-changed="false"]')).waitFor();
  assert.equal(await register(this, name).getByText("changed", { exact: true }).count(), 0);
});

When("I toggle the breakpoint at address {word}", async function (this: WebWorld, addr: string) {
  await this.page.getByRole("button", { name: `Toggle breakpoint at ${addr}`, exact: true }).click();
});

Then("the machine status is {string}", async function (this: WebWorld, text: string) {
  await status(this).filter({ hasText: text }).waitFor();
});

Then("memory byte {word} shows {string} and is marked written", async function (this: WebWorld, addr: string, value: string) {
  await this.page.locator(`[data-addr="${addr}"][data-written="true"]`).filter({ hasText: exact(value) }).waitFor();
});

// C Explore

const instr = (w: WebWorld, text: string) => w.page.locator("button.instr").filter({ hasText: text });
const group = (w: WebWorld, line: number) => w.page.locator(`[data-group-line="${line}"]`);

Then("the assembly group for source line {int} lists {string}", async function (this: WebWorld, line: number, text: string) {
  await group(this, line).first().locator("button.instr").filter({ hasText: text }).first().waitFor();
});

Then("the assembly group for source line {int} is headed {string}", async function (this: WebWorld, line: number, text: string) {
  await group(this, line).first().locator("button.chip").filter({ hasText: text }).waitFor();
});

Then("source line {int} has {int} assembly chips", async function (this: WebWorld, line: number, count: number) {
  const chips = this.page.locator(`button.chip[data-chip-line="${line}"]`);
  await chips.first().waitFor();
  assert.equal(await chips.count(), count);
});

Then(
  "the assembly chips for source line {int} are labelled {string} and {string}",
  async function (this: WebWorld, line: number, first: string, second: string) {
    const chips = this.page.locator(`button.chip[data-chip-line="${line}"]`);
    await chips.nth(0).filter({ hasText: first }).waitFor();
    await chips.nth(1).filter({ hasText: second }).waitFor();
  },
);

Then("the instruction {string} is not listed", async function (this: WebWorld, text: string) {
  await instr(this, "addi sp, sp, -32").first().waitFor(); // the list has rendered
  assert.equal(await instr(this, text).count(), 0);
});

Then("the instruction {string} is listed", async function (this: WebWorld, text: string) {
  await instr(this, text).first().waitFor();
});

When("I switch on {string}", async function (this: WebWorld, label: string) {
  await this.page.getByLabel(label).check();
});

async function sourceLine(w: WebWorld, line: number) {
  const lines = w.page.locator(".monaco-editor .view-lines .view-line");
  await lines.first().waitFor();
  const boxes: { top: number; index: number }[] = [];
  for (let index = 0; index < (await lines.count()); index++) {
    const box = await lines.nth(index).boundingBox();
    if (box) boxes.push({ top: box.y, index });
  }
  boxes.sort((a, b) => a.top - b.top);
  return lines.nth(boxes[line - 1].index);
}

When("I hover over source line {int}", async function (this: WebWorld, line: number) {
  const box = (await (await sourceLine(this, line)).boundingBox())!;
  await this.page.mouse.move(box.x + 30, box.y + box.height / 2);
  await this.page.mouse.move(box.x + 34, box.y + box.height / 2);
});

Then("the instructions for source line {int} are highlighted", async function (this: WebWorld, line: number) {
  await group(this, line).first().locator('button.instr[data-linked="true"]').first().waitFor();
  assert.equal(await group(this, line).first().locator('button.instr[data-linked="false"]').count(), 0);
});

Then("the instructions for source line {int} are not highlighted", async function (this: WebWorld, line: number) {
  await group(this, line).first().locator("button.instr").first().waitFor();
  assert.equal(await group(this, line).locator('button.instr[data-linked="true"]').count(), 0);
});

When("I select the instruction {string}", async function (this: WebWorld, text: string) {
  await instr(this, text).first().click();
});

Then("the Bits card shows the decoded text {string}", async function (this: WebWorld, text: string) {
  await this.page.getByRole("group", { name: "Bits" }).locator(".bits-text").filter({ hasText: text }).waitFor();
});

Then("the Bits card has the segment {string}", async function (this: WebWorld, label: string) {
  await this.page.locator("[data-segment-label]").filter({ hasText: exact(label) }).first().waitFor();
});

Then("source line {int} is highlighted in the editor", async function (this: WebWorld, line: number) {
  await this.page.locator(`.monaco-editor .src-linked-${line}`).first().waitFor();
});

Then("every bit segment has a text label", async function (this: WebWorld) {
  const segments = this.page.locator("[data-segment]");
  await segments.first().waitFor();
  for (let i = 0; i < (await segments.count()); i++) {
    assert.ok((await segments.nth(i).innerText()).trim() !== "", `segment ${i} has no text`);
    assert.ok(await segments.nth(i).getAttribute("aria-label"), `segment ${i} has no accessible name`);
  }
});

const machineRow = (w: WebWorld, text: string) => w.page.locator("tr[data-machine-row]").filter({ hasText: text });

Then("the machine row for {string} shows the bytes {string}", async function (this: WebWorld, text: string, bytes: string) {
  await machineRow(this, text).locator("[data-bytes]").filter({ hasText: bytes }).waitFor();
});

Then("the machine row for {string} shows the word {string}", async function (this: WebWorld, text: string, word: string) {
  await machineRow(this, text).locator("[data-word]").filter({ hasText: word }).waitFor();
});

Then("the machine row for {string} shows the binary {string}", async function (this: WebWorld, text: string, bits: string) {
  await machineRow(this, text).locator("[data-binary]").filter({ hasText: bits }).waitFor();
});

Then("the current instruction is {string}", async function (this: WebWorld, text: string) {
  await this.page.locator('button.instr[aria-current="step"]').filter({ hasText: text }).waitFor();
});

Then("there is no inspector pane", async function (this: WebWorld) {
  await this.page.getByRole("button", { name: "Explore", exact: true }).waitFor();
  assert.equal(await this.page.getByRole("complementary", { name: "Inspector" }).count(), 0);
});
