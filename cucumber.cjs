const base = {
  paths: ["features/**/*.feature"],
  requireModule: ["tsx/cjs"],
  require: ["features/support/**/*.ts", "features/steps/**/*.ts"],
  format: ["progress-bar"],
};

module.exports = {
  // @linux-only scenarios need prlimit; they are skipped on other platforms.
  // @docker scenarios (explorer vs GNU binutils and riscv-tests) need Docker; see `npm run test:docker`.
  default: { ...base, tags: "not @linux-only and not @docker" },
  // `npm run test:linux` (run inside the runner container) includes them.
  // The test image carries only runner/, so this profile loads just the runner specs and steps.
  linux: {
    ...base,
    paths: ["features/runner/**/*.feature"],
    require: [
      "features/support/runner-server.ts",
      "features/steps/runner.steps.ts",
      "features/steps/interactive.steps.ts",
      "features/steps/sandbox-switch.steps.ts",
    ],
  },
  // `npm run test:web`: only the browser specs (builds web/ and launches Chromium).
  // `npm run test:docker`: explorer differential and riscv-tests specs (Docker required).
  docker: { ...base, paths: ["features/explorer/**/*.feature"], tags: "@docker" },
  web: { ...base, paths: ["features/web/**/*.feature"] },
};
