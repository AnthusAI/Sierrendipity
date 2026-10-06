import { Before, Given, Then, When } from "@cucumber/cucumber";
import assert from "node:assert/strict";
import { createPreSignUpHandler } from "../../api/src/pre-sign-up";

let allowlist: string | undefined;
let outcome: "allowed" | "rejected" | undefined;

Before({ tags: "@cloud" }, () => {
  allowlist = undefined;
  outcome = undefined;
});

Given(/^the allowlist contains (.+)$/, (list: string) => {
  allowlist = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).join(", ");
});

Given("the allowlist is not configured", () => {
  allowlist = undefined;
});

When("{string} tries to sign up", async (email: string) => {
  const handler = createPreSignUpHandler({ getAllowlist: async () => allowlist });
  try {
    await handler({ request: { userAttributes: { email } } });
    outcome = "allowed";
  } catch {
    outcome = "rejected";
  }
});

Then("the sign-up is allowed", () => assert.equal(outcome, "allowed"));
Then("the sign-up is rejected", () => assert.equal(outcome, "rejected"));
