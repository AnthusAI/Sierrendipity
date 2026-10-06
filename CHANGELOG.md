# [0.1.0](https://github.com/AnthusAI/Sierrendipity/compare/v0.0.0...v0.1.0) (2026-10-06)


### Bug Fixes

* **cloud:** bind sessions to the task, narrow egress and recheck allowlist ([6d8a15b](https://github.com/AnthusAI/Sierrendipity/commit/6d8a15b58672688b3d16ec33b1d50596ef909f06))
* **runner:** add RUNNER_SANDBOX=off opt-out for unprivileged ci ([1ad98d2](https://github.com/AnthusAI/Sierrendipity/commit/1ad98d29bcd1ad2de4a7a59a81ba22e3a439ab88))
* **runner:** deny System V IPC and remove leftover objects when a run ends ([dfecfbf](https://github.com/AnthusAI/Sierrendipity/commit/dfecfbfeb9ec1f6cdb6edf33468eea7c2d4b2086))
* **runner:** drain oversized bodies so clients can read the 413 ([a4438a2](https://github.com/AnthusAI/Sierrendipity/commit/a4438a25deae8c093e218a78e2ac169b4c100057))
* **runner:** isolate each run under its own uid and clean up stragglers, disk and namespaces ([6a2ed35](https://github.com/AnthusAI/Sierrendipity/commit/6a2ed35d1fc5af65bec7d358d55dfe7eae2b382d))
* **runner:** validate requests, harden cleanup, narrow memory-limit detection ([23dff62](https://github.com/AnthusAI/Sierrendipity/commit/23dff6282b9cccddb45d0159e574dbfb1bdb134e))
* **web:** accept a Cognito domain published without a scheme ([8c36c4e](https://github.com/AnthusAI/Sierrendipity/commit/8c36c4e5c56da9b572626b6417deae993c5d4ad1))
* **web:** harden warm-up, runs, storage, input and sign-in errors ([19802c0](https://github.com/AnthusAI/Sierrendipity/commit/19802c085b93f24b94f56d43f40d2c93a0cf9929))


### Features

* **api:** add pre-sign-up, control and proxy lambda handlers ([93b68ef](https://github.com/AnthusAI/Sierrendipity/commit/93b68ef5f9d490a5321cc0aed986d10f6d585946))
* **infra:** add cdk stack for cognito, control, proxy, fargate and hosting ([02403aa](https://github.com/AnthusAI/Sierrendipity/commit/02403aa4e49710f0858b293b89dba5127cbfdc18))
* **runner:** run multi-file Python, C and C++ projects over HTTP ([1359bd5](https://github.com/AnthusAI/Sierrendipity/commit/1359bd58c4a1455188c30d74112ce72b590af5c4))
* **runner:** sandbox student code, add interactive sessions, shared secret and idle exit ([9ec4cda](https://github.com/AnthusAI/Sierrendipity/commit/9ec4cdabe01e3c854c21f640f39753d5d79c79b6))
* **web:** add browser IDE with Monaco, xterm and Google sign-in client ([c77f6ca](https://github.com/AnthusAI/Sierrendipity/commit/c77f6ca4e98d38bc9034e4a9434c805c419bad0a))
