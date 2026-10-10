# Architecture

Browser IDE -> Cognito (Google sign-in) -> control Lambda -> Fargate task; browser -> proxy Lambda -> task.
Everything scales to zero: no ALB, NAT, or always-on compute.

## Components

| Part | Where | Notes |
| --- | --- | --- |
| Web IDE | `web/`, S3 + CloudFront | Vite, React, Monaco, xterm.js. Reads `/config.json` at runtime. |
| Auth | Cognito user pool, Google as federated IdP, hosted UI, PKCE | Allowlist (not in repo) enforced by a pre-sign-up Lambda. |
| Control Lambda | `api/`, Function URL, outside the VPC | Verifies the Cognito JWT, starts/stops the student's Fargate task, returns a signed session token. |
| Proxy Lambda | `api/`, streaming Function URL, in the default VPC | Verifies the session token and forwards to the task's private IP. Streams SSE. |
| Runner | `runner/`, Fargate task (Spot, default VPC, public subnet, public IP, no NAT) | Compiles and runs student code. Exits itself when idle. |

The task security group allows port 8080 only from the proxy Lambda's security group.
The runner server runs as root in the container (needs CAP_SETUID, CAP_SETGID, CAP_KILL, CAP_CHOWN, CAP_DAC_OVERRIDE). Each run gets its own unprivileged uid; student code runs under a seccomp filter that denies network sockets, namespaces and mounts, with a scrubbed environment and resource limits. Everything a run left behind (processes, files) is removed by uid when it ends.

## Runner API (port 8080)

- `POST /run` - batch run, returns the full result (exists).
- `POST /runs` `{language, files, entry?, stdin?, limits?}` -> `202 {runId}`; one active run at a time (409 otherwise).
- `GET /runs/{runId}/events` - Server-Sent Events, each with a numeric `id`; honors `Last-Event-ID` and `?after=`. Event types: `compile` `{output, ok}` (C/C++ only), `output` `{data}`, `exit` `{status, exitCode, signal, wallMs}`; the stream ends after `exit`. Programs run on a pty with echo disabled, so `output` is program output only (lines end `\r\n`). The replay buffer is bounded; if the resume point was dropped the server first sends an id-less `gap` event `{firstId}`.
- `POST /runs/{runId}/stdin` `{data, eof?}`.
- `POST /runs/{runId}/stop`.
- `POST /explain` `{language: "c", files, optLevel?: "O0"|"Og"}` -> `200 {status, compileOutput, program?, instructions?, lineMap?}`: compiles C for bare-metal RV32IM and returns a flat program image plus the instruction list and source-line map (see [explorer-endpoint.md](explorer-endpoint.md)). Same auth, concurrency cap and 400/413 mapping as `POST /run`.
- `GET /healthz`.
- If `RUNNER_SECRET` is set, every request except `/healthz` needs header `x-runner-secret` (else 401). More than `MAX_CONCURRENT_RUNS` (default 4) simultaneous runs get 429.
- Interactive runs are stopped after `INTERACTIVE_MAX_WALL_S` (default 1800) of wall time. A run that writes more than 200 MB of files is stopped as `output_limit_exceeded`.
- The process exits (status 0) after `IDLE_TIMEOUT_S` (default 1200) with no requests and no active run.

## Native languages (Python, C, C++, Rust)

`language` is `python`, `c`, `cpp` or `rust`. All four run in the same sandbox (see above).

### Rust

- Toolchain: `rustc` 1.99.0 (pinned by `RUST_VERSION` in `runner/Dockerfile`; bump it deliberately), installed with rustup (`--profile minimal`) in its own Docker stage under `/opt/rust` (world-readable, never written at run time), copied into the shared runtime image. `/opt/rust/toolchain` links to the toolchain; cargo is deleted. The `riscv32im-unknown-none-elf` target is installed too, for the explorer work.
- Request: only `.rs` files are accepted (anything else is 400). The crate root is `main.rs`, or `entry` when it is one of the submitted files; `mod` declarations resolve relative to it (`a/mod.rs`, or `a.rs` with `a/b.rs`). A project with neither `main.rs` nor `entry` is 400. Paths, sizes and limits follow the same validation as C and C++.
- Compile: `rustc --edition 2021 -C opt-level=2 -C debuginfo=0 -C panic=unwind -C overflow-checks=on --color never --error-format=human -o prog <root>`. rustc itself, never cargo: no crates, build scripts or proc-macros. No flag comes from the student, and `RUSTC_BOOTSTRAP` is not in the scrubbed environment, so `#![feature(...)]` is refused by the compiler (`error[E0554]`). Messages read `--> main.rs:3:5` with temp paths scrubbed. The compiler runs as the run's uid with no seccomp filter, as gcc does, and the same 1.5 GB address-space cap and compile time limit.
- Overflow checks are on, so `i32::MAX + 1` panics with `attempt to add with overflow` as in the debug builds Rust courses teach with (`cargo run` default), while opt-level 2 keeps programs fast.
- Address space (`RLIMIT_AS`) for rustc, measured on 1.99.0 (aarch64): hello world compiles from 512 MB (384 MB fails), a 2,500-line program from 512 MB, a generics and macro heavy one from 640 MB; at 512 MB that one hangs until the compile time limit instead of failing. The 1.5 GB cap leaves more than 2x headroom, so no Rust-specific cap was needed.
- Run: the same uid, rlimit and seccomp helpers as C and C++. A panic exits 101 (`runtime_error`, message on stderr). Stack overflow is SIGABRT (`runtime_error`); a failed huge allocation prints `memory allocation of N bytes failed` and is `memory_limit_exceeded`; an infinite loop is `time_limit_exceeded`; flooding stdout is `output_limit_exceeded`; `std::process::exit(n)` is `runtime_error` with exit code `n`. When `main` returns the process ends, so a spinning thread does not outlive it.
- Interactive runs use the pty wrapper. Rust's stdout is line-buffered even on a terminal and, unlike C, is not flushed when the program reads stdin: `print!("Name: ")` is only shown after a newline unless the program calls `io::stdout().flush()`. The IDE starter flushes.
- Hostile inputs (all specified in `features/runner/rust-sandbox.feature`): `include_bytes!("/dev/zero")`, `include_str!("/dev/stdin")` and `include!("/dev/zero")` end as `compile_error` ("couldn't read ...: out of memory") within a few seconds because of the address-space cap; `include_str!("/proc/1/environ")` is a compile error (the run's uid cannot read it); `include_str!("/etc/passwd")` works, as `#include` does for C, because the file is world-readable. `std::net::TcpStream::connect`, `extern "C" socket` and a raw `syscall(SYS_socket)` all fail with `PermissionDenied` (seccomp). Reading `/proc/1/environ` or `/root` is permission denied, while listing `/` works like C. `std::process::Command::new("sh")` runs as the same unprivileged uid with the scrubbed environment and the same seccomp filter (no network, no secrets); anything it leaves behind is killed and deleted by uid when the run ends. A thread-spawn loop hits the per-uid `RLIMIT_NPROC` or the address-space cap (the spawn panics, 101) and is cleaned up.
- Image cost: the runtime image grows from 898 MB to 1,467 MB (+570 MB uncompressed, about +193 MB compressed layers); the `riscv32im-unknown-none-elf` target is about 62 MB of that (20 MB compressed). Estimate for a cold Fargate start: the pull is roughly 190 MB larger, so expect about 5 to 15 s more on a cold task start; runs on a warm task are unaffected. On a 0.5 vCPU, 1 GB task (`docker run --cpus=0.5 --memory=1g`) a Rust hello world takes about 0.4 to 0.6 s end to end and a 2,500-line program about 4 to 5 s to compile, well within the default 15 s compile limit.

## Control API (Function URL, `Authorization: Bearer <Cognito token>`)

- `POST /session` - start the caller's task if none is running; returns `{state: "starting"|"ready", sessionToken?}`.
- `GET /session` - current state; when `ready`, includes `sessionToken`.
- `DELETE /session` - stop the task.
- One concurrent task per user.

## Proxy API (streaming Function URL, `Authorization: Bearer <sessionToken>`)

Forwards the runner API paths (a whitelist: `POST /run`, `POST /runs`, `POST /explain`, `GET /runs/{id}/events`, `POST /runs/{id}/stdin|stop`, `GET /healthz`), e.g. `POST /runs`, `GET /runs/{id}/events`. The session token is an HMAC-signed `{sub, taskIp, exp}`; the key is shared with the control Lambda. `EventSource` cannot send headers, so the web client reads SSE with `fetch`.

## Rules

- No email addresses anywhere in the repo; the allowlist lives in AWS (SSM SecureString).
- Google OAuth credentials live in Secrets Manager `sierrendipity/google-oauth` (us-east-1, legacy account).
- Deploy with `AWS_PROFILE=legacy`, region us-east-1.

## Deployment (infra/)

- One CDK stack, `Sierrendipity` (`infra/lib/stack.ts`), in account 335163751677, us-east-1: `cd infra && AWS_PROFILE=legacy npx cdk deploy`.
- Create the allowlist first (outside the repo): SSM SecureString `/sierrendipity/allowed-emails`, comma-separated. A missing parameter rejects every sign-up.
- The site deploys `web/dist` when it exists (run the web build first), otherwise `infra/placeholder-site`. `/config.json` is written by the deployment: `{region, cognitoDomain, clientId, controlUrl, proxyUrl, redirectUri}`; URLs have no trailing slash.
- Optional budget alert subscriber: `-c budgetAlertEmail=...` (never committed). Alerts go to an SNS topic regardless.

### GitHub production site delivery

Once enabled, a successful CI run for a push to `main` deploys only the built `web/dist` site assets. It uses the existing GitHub OIDC provider and the `SierrendipityGitHubProductionDeploy` role; it does not run CDK or change Lambdas, Fargate, Cognito, DNS, runtime configuration, or the protected `deployments/` records. The role explicitly denies writes to `config.json` and `deployments/*` even though it can sync other site assets. The workflow stamps `deployment.json` with the immutable Git SHA, uploads it with the site, invalidates CloudFront, and fails unless the production domain serves that exact revision.

The OIDC trust is pinned to GitHub's immutable subject for this repository and branch: `repo:AnthusAI@152415604/Sierrendipity@1407197360:ref:refs/heads/main`. It accepts no pull-request, tag, fork, or non-`main` subject.

One-time, human-operated bootstrap (after reviewing the exact CDK diff) deploys only the dedicated role stack from `infra/` with the `legacy` profile:

```sh
AWS_PROFILE=legacy npx cdk diff SierrendipityGitHubDeploy
AWS_PROFILE=legacy npx cdk deploy SierrendipityGitHubDeploy --require-approval never
```

The dedicated stack is bound to the existing production site bucket and distribution, so the bootstrap does not alter the live application stack. This is deliberately a content-only delivery path. Any automated delivery for backend, runner, or general infrastructure requires a separately reviewed, resource-scoped design and role.

## Custom domain

- The site is served at `https://sierrendipity.anth.us` (the CloudFront default domain keeps working). Context keys: `siteDomain` (default `sierrendipity.anth.us`; an empty string disables the custom domain), `hostedZoneId` (default `Z02552332GG6AM25SFP73`) and `hostedZoneName` (default `anth.us`). The zone is imported by attributes, so synth stays offline.
- The stack creates an ACM certificate for the domain (DNS-validated in that zone, us-east-1), attaches it to the distribution (TLS 1.2 minimum), and adds A and AAAA alias records. Output: `CustomDomainUrl`.
- The Cognito app client allows the custom origin (with and without a trailing slash) alongside the CloudFront origin and `http://localhost:5173`; both Function URLs allow the custom origin in CORS; `/config.json` `redirectUri` is `https://<siteDomain>/`. The Cognito hosted-UI domain and the Google redirect URI are unchanged.
