module.exports = {
  default: {
    paths: ["features/**/*.feature"],
    requireModule: ["tsx/cjs"],
    require: ["features/support/**/*.ts", "features/steps/**/*.ts"],
    format: ["progress-bar"],
  },
};
