import { Then } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import type { WebWorld } from "../support/web-world.ts";

Then(
  "the backend received an explain request for {string} with checks {string} and the file {string}",
  async function (this: WebWorld, language: string, checks: string, file: string) {
    const last = this.mock.explainRequests.at(-1);
    if (!last || last.language !== language || String(last.checks) !== checks || !last.files.some((f) => f.path === file)) {
      throw new Error(`unexpected explain request: ${JSON.stringify(last)}`);
    }
  },
);

Then("the assembly shows a runtime group for the function {string}", async function (this: WebWorld, name: string) {
  await this.page.locator("button.chip").filter({ hasText: name }).first().waitFor();
});

Then("the {string} toggle is offered", async function (this: WebWorld, label: string) {
  await this.page.getByLabel(label).waitFor();
});

Then("the {string} toggle is not offered", async function (this: WebWorld, label: string) {
  await this.page.getByRole("button", { name: "Run", exact: true }).waitFor(); // the toolbar has rendered
  assert.equal(await this.page.getByLabel(label).count(), 0);
});

Then("the {string} button is offered", async function (this: WebWorld, name: string) {
  await this.page.getByRole("button", { name, exact: true }).waitFor();
});

Then("the {string} button is not offered", async function (this: WebWorld, name: string) {
  await this.page.getByRole("button", { name: "Run", exact: true }).waitFor();
  assert.equal(await this.page.getByRole("button", { name, exact: true }).count(), 0);
});
