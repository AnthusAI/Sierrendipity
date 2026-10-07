# Sierrendipity

A web-based coding tutor for a high-school student learning to program.

- Lessons teach RISC-V machine code and assembly, then C and C++ (there are no Python lessons)
- Browser IDE with small multi-file projects, usable from anywhere
- Lessons are added one at a time by the tutor, the student, and Claude
- Code runs on AWS: the runner executes Python and compiles then executes C, C++ and Rust (the lessons themselves do not teach Python)

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

Compilation Explorer (milestone M9): the IDE also takes RISC-V assembly and raw machine code, runs
them in an in-browser RV32IM emulator (step, step back, registers, memory, breakpoints), and for C
shows source lines linked to assembly instructions, their machine-code bytes and bit fields via
`POST /explain`. Verified: the emulator against the official riscv-tests and GNU as/objdump, and
`/explain` on a real Fargate task with the returned program run in the emulator. See
[docs/m9-plan.md](docs/m9-plan.md) and [docs/curriculum-design.md](docs/curriculum-design.md).

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
