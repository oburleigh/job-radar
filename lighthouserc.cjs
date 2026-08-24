module.exports = {
  ci: {
    collect: {
      url: ["http://127.0.0.1:3300/"],
      startServerCommand: "pnpm serve:lighthouse",
      startServerReadyPattern: "Lighthouse server ready",
      startServerReadyTimeout: 120_000,
      numberOfRuns: 3,
      ...(process.env.CHROME_PATH ? { chromePath: process.env.CHROME_PATH } : {}),
      settings: {
        preset: "desktop",
        chromeFlags: ["--no-sandbox", "--disable-dev-shm-usage"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9, aggregationMethod: "median" }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "artifacts/lighthouse",
    },
  },
};
