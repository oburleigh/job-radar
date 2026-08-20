/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  coverageAnalysis: "perTest",
  mutate: [
    "src/contexts/discovery/domain/**/*.ts",
    "src/contexts/discovery/application/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/test-support/**",
  ],
  plugins: ["@stryker-mutator/vitest-runner"],
  reporters: ["clear-text", "progress", "html"],
  testRunner: "vitest",
  thresholds: {
    break: 80,
    high: 90,
    low: 80,
  },
  tsconfigFile: "tsconfig.json",
};

export default config;
