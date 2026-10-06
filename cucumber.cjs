const base = {
  paths: ["features/**/*.feature"],
  requireModule: ["tsx/cjs"],
  require: ["features/support/**/*.ts", "features/steps/**/*.ts"],
  format: ["progress-bar"],
};

module.exports = {
  // @linux-only scenarios need prlimit; they are skipped on other platforms.
  default: { ...base, tags: "not @linux-only and not @docker" },
  // `npm run test:linux` (run inside the runner container) includes them.
  // The test image carries only runner/, so this profile loads just the runner specs and steps.
  linux: {
    ...base,
    paths: ["features/runner/**/*.feature"],
    require: [
      "features/support/runner-server.ts",
      "features/steps/runner.steps.ts",
      "features/steps/explain.steps.ts",
      "features/steps/interactive.steps.ts",
      "features/steps/sandbox-switch.steps.ts",
    ],
  },
  // `npm run test:web`: only the browser specs (builds web/ and launches Chromium).
  web: { ...base, paths: ["features/web/**/*.feature"] },
  // Quick loop for the explorer library: `npx cucumber-js --profile explorer`.
  explorer: { ...base, paths: ["features/explorer/**/*.feature"], tags: "not @docker" },
  // Quick loop for the lesson library: `npx cucumber-js --profile lessons`.
  lessons: {
    ...base,
    paths: ["features/lessons/**/*.feature"],
    require: ["features/steps/lesson*.ts"],
  },
  // `npm run test:docker`: explorer differential and riscv-tests specs; they need Docker.
  docker: { ...base, paths: ["features/explorer/**/*.feature"], tags: "@docker" },
};
