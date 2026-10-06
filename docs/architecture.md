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
Student code runs under a seccomp filter that denies network sockets, with a scrubbed environment.

## Runner API (port 8080)

- `POST /run` - batch run, returns the full result (exists).
- `POST /runs` `{language, files, entry?, stdin?, limits?}` -> `202 {runId}`; one active run at a time (409 otherwise).
- `GET /runs/{runId}/events` - Server-Sent Events, each with a numeric `id`; honors `Last-Event-ID` and `?after=`. Event types: `compile` `{output, ok}`, `output` `{data}`, `exit` `{status, exitCode, signal, wallMs}`.
- `POST /runs/{runId}/stdin` `{data, eof?}`.
- `POST /runs/{runId}/stop`.
- `GET /healthz`.
- The process exits (status 0) after `IDLE_TIMEOUT_S` (default 1200) with no requests and no active run.

## Control API (Function URL, `Authorization: Bearer <Cognito token>`)

- `POST /session` - start the caller's task if none is running; returns `{state: "starting"|"ready", sessionToken?}`.
- `GET /session` - current state; when `ready`, includes `sessionToken`.
- `DELETE /session` - stop the task.
- One concurrent task per user.

## Proxy API (streaming Function URL, `Authorization: Bearer <sessionToken>`)

Forwards any path to the task, e.g. `POST /runs`, `GET /runs/{id}/events`. The session token is an HMAC-signed `{sub, taskIp, exp}`; the key is shared with the control Lambda. `EventSource` cannot send headers, so the web client reads SSE with `fetch`.

## Rules

- No email addresses anywhere in the repo; the allowlist lives in AWS (SSM SecureString).
- Google OAuth credentials live in Secrets Manager `sierrendipity/google-oauth` (us-east-1, legacy account).
- Deploy with `AWS_PROFILE=legacy`, region us-east-1.

## Deployment (infra/)

- One CDK stack, `Sierrendipity` (`infra/lib/stack.ts`), in account 335163751677, us-east-1: `cd infra && AWS_PROFILE=legacy npx cdk deploy`.
- Create the allowlist first (outside the repo): SSM SecureString `/sierrendipity/allowed-emails`, comma-separated. A missing parameter rejects every sign-up.
- The site deploys `web/dist` when it exists (run the web build first), otherwise `infra/placeholder-site`. `/config.json` is written by the deployment: `{region, cognitoDomain, clientId, controlUrl, proxyUrl, redirectUri}`; URLs have no trailing slash.
- Optional budget alert subscriber: `-c budgetAlertEmail=...` (never committed). Alerts go to an SNS topic regardless.
