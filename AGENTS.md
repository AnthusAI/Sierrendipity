# Agent Instructions

## Project management with Kanbus

Use Kanbus for task management.
Why: Kanbus task management is MANDATORY here; every task must live in Kanbus.
When: Create/update the Kanbus task before coding; close it only after the change lands.
How: See CONTRIBUTING_AGENT.md for the Kanbus workflow, hierarchy, status rules, priorities, command examples, and the mistakes to avoid. Never inspect project/ or issue JSON directly (including with cat or jq); use Kanbus commands only.
Performance: Prefer kbs (Rust) when available; kanbus (Python) is equivalent but slower.
Warning: Editing project/ directly violates The Way. Do not read or write anything in project/; work only through Kanbus.
Git / PR policy: Rules for product-code commits, branch names, pull requests, and human approval live in this repository's AGENTS.md (outside this Kanbus section). CONTRIBUTING_AGENT.md covers Kanbus board mechanics such as `kbs commit`; follow AGENTS.md for product code and git workflow.


## Product code and BDD

- Stack: TypeScript throughout (CDK infra, Node Lambdas, Node runner, Vite/React web), plus a small C seccomp launcher. Python, C, and C++ are what the *student* writes, not what the platform is written in.
- Specifications are real Gherkin `.feature` files under `features/`, run with `npm test` (Cucumber.js). Write the scenario, watch it fail, then write the code. No red specs on `develop`.
- Commits use Conventional Commits (enforced by commitlint via husky). Semantic Release derives versions and CHANGELOG.md from them.
- Remote: AnthusAI/Sierrendipity (public). License: MIT.

## Git

This repository is its own git repo. Do not commit Sierrendipity into the parent `~/Projects` checkout.

`main` is the default branch and the release branch. `develop` is the integration branch (GitFlow).

`develop` is the continuous-integration branch. Merge accepted, green work there as soon as it is ready. Do not park completed work on long-lived feature branches waiting for `main`.

`main` is the release branch. Semantic Release runs only from `main`. Do not treat a merge to `develop` as a release. Never merge product work straight to `main`, and never push to it directly.

Open pull requests against `develop` for **product** work (`api/`, `runner/`, `web/`, `infra/`, `features/`, `lessons/`). Merge them there as soon as sub-agent review is addressed and CI is green. Promote `develop` to `main` when you intend a release, not as the daily integration path.

**Do not open a pull request for project management.** Kanbus issues, comments, status changes, and `project/wiki` pages commit on `develop` and push (`kbs commit`). No feature branch, no PR, no review loop. Mixing board files into a product PR is also wrong: land the board on `develop` first.

**Agent provenance:** AI coding agents set `KANBUS_AGENT_PLATFORM` and `KANBUS_AGENT_MODEL` (and `KANBUS_AGENT_NAME`) on every `kbs create` and `kbs comment`. `kbs update` rejects them, so unset them for updates.

## Pull request review

No human GitHub reviewer will show up. Review is done in this session by sub-agents. Do not mark a PR ready and wait. Launch a reviewer against the PR, treat request-changes as blocking, and have a second agent apply fixes. Approval from that loop, plus green CI, is the merge gate.

## Milestones

At every milestone, launch a **sub-agent** whose only job is Kanbus and the README. Comment on touched issues, keep statuses current, create issues for significant new work, and keep the README's status section matching git and AWS. Do not fold that into the implementation agent as an afterthought.
