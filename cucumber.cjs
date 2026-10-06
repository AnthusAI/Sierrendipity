const base = {
  paths: ["features/**/*.feature"],
  requireModule: ["tsx/cjs"],
  require: ["features/support/**/*.ts", "features/steps/**/*.ts"],
  format: ["progress-bar"],
};

module.exports = {
  // @linux-only scenarios need prlimit; they are skipped on other platforms.
  default: { ...base, tags: "not @linux-only" },
  // `npm run test:linux` (run inside the runner container) includes them.
  linux: base,
  // `npm run test:web`: only the browser specs (builds web/ and launches Chromium).
  web: { ...base, paths: ["features/web/**/*.feature"] },
};
