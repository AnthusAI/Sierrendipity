import { Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { WebWorld } from "../support/web-world";

const builder = (w: WebWorld) => w.page.locator("[data-lesson-player] [data-builder]");
const program = (w: WebWorld) => builder(w).getByRole("list", { name: "Program", exact: true });

When("I use {string} in the lesson's builder", async function (this: WebWorld, name: string) {
  await builder(this).getByRole("button", { name, exact: true }).click();
});
When("I tick the card {int} in the lesson's builder", async function (this: WebWorld, n: number) {
  await builder(this).getByRole("checkbox", { name: `Select card ${n}`, exact: true }).check();
});
When("I tick the card {int} and the card {int} in the lesson's builder", async function (this: WebWorld, a: number, b: number) {
  await builder(this).getByRole("checkbox", { name: `Select card ${a}`, exact: true }).check();
  await builder(this).getByRole("checkbox", { name: `Select card ${b}`, exact: true }).check();
});
Then("the lesson's program has {int} cards", async function (this: WebWorld, n: number) {
  await this.page.waitForFunction((count) => document.querySelectorAll("[data-lesson-player] [data-builder] [data-row-id]").length === count, n);
});
Then("the lesson's program shows the card {string}", async function (this: WebWorld, name: string) {
  await program(this).getByText(name, { exact: true }).first().waitFor();
});
Then("the lesson's program shows no card {string}", async function (this: WebWorld, name: string) {
  await program(this).getByText(name, { exact: true }).first().waitFor({ state: "detached" });
});
Then("the lesson's builder says {string}", async function (this: WebWorld, text: string) {
  const message = builder(this).getByTestId("builder-message").filter({ hasText: text.replace(/\\"/g, '"') });
  await message.first().waitFor();
});
Then("the button {string} in the lesson's builder is not available", async function (this: WebWorld, name: string) {
  const button = builder(this).getByRole("button", { name, exact: true });
  assert.equal(await button.isDisabled(), true);
});
Then("the lesson's builder has a checkbox named {string}", async function (this: WebWorld, name: string) {
  await builder(this).getByRole("checkbox", { name, exact: true }).waitFor();
});
Then("the lesson's builder has a list named {string}", async function (this: WebWorld, name: string) {
  await builder(this).getByRole("list", { name, exact: true }).waitFor();
});
Then("the lesson's builder has a region named {string}", async function (this: WebWorld, name: string) {
  await builder(this).getByRole("region", { name, exact: true }).waitFor();
});
Then("the lesson's builder has no button named {string}", async function (this: WebWorld, name: string) {
  await builder(this).waitFor();
  assert.equal(await builder(this).getByRole("button", { name, exact: true }).count(), 0);
});
