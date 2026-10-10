import { Given, Then } from "@cucumber/cucumber";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

type Plugin = string | [string, Record<string, unknown>];
let releaseConfig: { branches: string[]; plugins: Plugin[] };
let workflow = "";

const name = (p: Plugin) => (Array.isArray(p) ? p[0] : p);
const options = (short: string) => {
  const p = releaseConfig.plugins.find((x) => name(x) === `@semantic-release/${short}`);
  return Array.isArray(p) ? p[1] : {};
};
const assertJobs = (jobs: string[]) => {
  for (const job of jobs) assert.match(workflow, new RegExp(`^  ${job}:`, "m"), job);
};

Given("the semantic-release configuration", () => {
  releaseConfig = JSON.parse(readFileSync(".releaserc.json", "utf8"));
});

Given("the CI workflow", () => {
  workflow = readFileSync(".github/workflows/ci.yml", "utf8");
});

Given("the semantic-release workflow", () => {
  workflow = readFileSync(".github/workflows/semantic-release.yml", "utf8");
});

Then("it releases from the {string} branch", (branch: string) => {
  assert.deepEqual(releaseConfig.branches, [branch]);
});

Then("it uses the plugins {string}, {string} and {string}", (a: string, b: string, c: string) => {
  const names = releaseConfig.plugins.map(name);
  for (const short of [a, b, c]) assert.ok(names.includes(`@semantic-release/${short}`), short);
});

Then("it does not publish to npm", () => {
  assert.equal(options("npm").npmPublish, false);
});

Then(
  "the git plugin commits {string}, {string} and {string} with {string}",
  (a: string, b: string, c: string, marker: string) => {
    const git = options("git") as { assets: string[]; message: string };
    assert.deepEqual([...git.assets].sort(), [a, b, c].sort());
    assert.ok(git.message.includes(marker));
  },
);

Then("it defines the jobs {string}, {string}, {string} and {string}", (a: string, b: string, c: string, d: string) => {
  assertJobs([a, b, c, d]);
  assert.match(workflow, /^  commitlint:\n    if: github\.event_name == 'pull_request' && github\.base_ref == 'develop'$/m);
});

Then("it defines the jobs {string} and {string}", (a: string, b: string) => {
  assertJobs([a, b]);
});

Then("it runs on pull requests and on pushes to {string} and {string}", (a: string, b: string) => {
  assert.match(workflow, /^ {2}pull_request:/m);
  assert.match(workflow, new RegExp(`branches: \\[(${a}, ${b}|${b}, ${a})\\]`));
});

Then("it is triggered by the completion of the {string} workflow", (wf: string) => {
  assert.match(workflow, /^ {2}workflow_run:/m);
  assert.ok(workflow.includes(`workflows: ["${wf}"]`));
  assert.ok(workflow.includes("types: [completed]"));
});

Then("the production deployment job uses GitHub OIDC only for validated main pushes", () => {
  assert.match(workflow, /^  deploy-production:/m);
  const deploy = workflow.slice(workflow.indexOf("  deploy-production:"));
  assert.match(deploy, /^    if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m);
  assert.match(deploy, /^    needs: \[specs, runner-linux, typecheck\]$/m);
  assert.match(deploy, /^    permissions:\n      contents: read\n      id-token: write$/m);
  assert.match(deploy, /uses: aws-actions\/configure-aws-credentials@v4/);
  assert.match(deploy, /role-to-assume: arn:aws:iam::335163751677:role\/SierrendipityGitHubProductionDeploy/);
  assert.match(deploy, /SITE_BUCKET: sierrendipity-sitebucket397a1860-ylhnjttg8nz0/);
  assert.match(deploy, /SITE_DISTRIBUTION_ID: E1O1EHD0LKT7W6/);
  assert.match(deploy, /npm run build -w web/);
  assert.match(deploy, /aws s3 sync web\/dist/);
  assert.match(deploy, /--exclude config\.json/);
  assert.match(deploy, /--exclude 'deployments\/\*'/);
  assert.match(deploy, /aws cloudfront create-invalidation/);
  assert.match(deploy, /web\/dist\/deployment\.json/);
  assert.match(deploy, /aws s3 cp "s3:\/\/\$\{SITE_BUCKET\}\/deployment\.json" -/);
  assert.match(deploy, /Verified production revision/);
  assert.doesNotMatch(deploy, /cdk deploy/);
  assert.match(deploy, /StackStatus/);
  assert.match(deploy, /UPDATE_COMPLETE/);
  assert.match(deploy, /curl --fail --show-error --retry 5 https:\/\/sierrendipity\.anth\.us\/config\.json/);
  assert.match(deploy, /https:\/\/sierrendipity\.anth\.us\/deployment\.json/);
});
