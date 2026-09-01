import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe("repository tooling", () => {
  it("uses Lefthook for Git hooks and Biome for code quality", () => {
    expect(packageJson.scripts?.prepare).toBe("lefthook install");
    expect(packageJson.scripts?.lint).toContain("biome check");
    expect(packageJson.scripts?.format).toContain("biome format");
  });

  it("does not install overlapping hook, lint, or formatting toolchains", () => {
    const packages = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    expect(packages).not.toHaveProperty("husky");
    expect(packages).not.toHaveProperty("eslint");
    expect(packages).not.toHaveProperty("prettier");
    expect(packages).not.toHaveProperty("tailwindcss");
    expect(packages).not.toHaveProperty("@tailwindcss/postcss");
    expect(existsSync(path.join(repositoryRoot, ".husky"))).toBe(false);
    expect(existsSync(path.join(repositoryRoot, "postcss.config.mjs"))).toBe(false);
  });

  it("keeps the web framework inside the Discovery composition adapter", () => {
    expect(packageJson.dependencies).not.toHaveProperty("next");
    expect(packageJson.scripts?.dev).toBe("react-router dev --force --strictPort");
    expect(existsSync(path.join(repositoryRoot, "src", "app"))).toBe(false);
    expect(
      existsSync(
        path.join(
          repositoryRoot,
          "src",
          "contexts",
          "discovery",
          "composition",
          "web",
          "routes.ts",
        ),
      ),
    ).toBe(true);
  });
});
