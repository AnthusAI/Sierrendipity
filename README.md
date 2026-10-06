# Sierrendipity

A web-based coding tutor for a high-school student learning to program.

- Languages: Python, C, C++
- Browser IDE with small multi-file projects, usable from anywhere
- Lessons are added one at a time by the tutor, the student, and Claude
- Code runs on AWS: Python is executed, C/C++ is compiled and then executed

## What is live today

The stack `Sierrendipity` is deployed to AWS (account `legacy`, us-east-1) from `develop`.

- Site: https://d11ihk8g92hg9x.cloudfront.net (serves `/config.json`)
- Sign-in: Cognito domain `sierrendipity` with a Google OAuth client
- Cloud backend: control Lambda and streaming proxy (both return 401 without a token);
  the ARM64 runner container starts on Fargate with no NAT and logs `runner listening on 8080`

Verified: 117 Gherkin scenarios pass on macOS (runner, cloud, web); the runner Linux profile
passes 63 scenarios in the arm64 image; `cdk deploy` succeeds. End to end on 2026-10-06: a Google
sign-in through the deployed site started a Fargate task, and a Python program ran interactively
in the browser. On Fargate the sandbox blocks network sockets and runs student code as an
unprivileged per-run user.

Not yet verified: the one-task-per-user and global-cap limits against real concurrent requests,
and rejection of an unapproved Google account (both covered by specs only).

Not set up yet: CI and automated releases (milestone M8).

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Development

```
npm install
npm test      # Gherkin specs (Cucumber.js)
```

Work is tracked in Kanbus (`kbs`); see `AGENTS.md` and `CONTRIBUTING_AGENT.md`.
