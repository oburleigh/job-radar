import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const packages = {
  tokens: {
    directory: "packages/design-tokens",
    name: "@job-radar/design-tokens",
  },
  ui: {
    directory: "packages/design-ui",
    name: "@job-radar/design-ui",
  },
} as const;

const discoveryPresentation = "src/contexts/discovery/presentation/web";
const webDocs = "apps/web-docs";

describe("design system boundaries", () => {
  it("uses stable aliases instead of parent-directory imports", () => {
    const roots = ["src", "scripts", "tests", "e2e"];

    for (const root of roots) {
      for (const file of sourceFiles(path.join(repositoryRoot, root))) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/(?:from\s+|import\s*\()["']\.\.\//);
      }
    }
  });

  it("declares only context-neutral design assets as shared packages", () => {
    for (const workspacePackage of Object.values(packages)) {
      const manifestPath = path.join(repositoryRoot, workspacePackage.directory, "package.json");
      expect(existsSync(manifestPath), workspacePackage.name).toBe(true);

      const manifest = readJson(manifestPath);
      expect(manifest.name).toBe(workspacePackage.name);
      expect(manifest.private).not.toBe(true);
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(manifest.exports).toBeDefined();
    }

    expect(existsSync(path.join(repositoryRoot, "packages/discovery"))).toBe(false);
    expect(
      existsSync(path.join(repositoryRoot, discoveryPresentation, "components/job-card.tsx")),
    ).toBe(true);
  });

  it("keeps shared packages free of product contexts and routing", () => {
    for (const workspacePackage of Object.values(packages)) {
      const packageRoot = path.join(repositoryRoot, workspacePackage.directory);
      const manifest = readJson(path.join(packageRoot, "package.json"));
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      };

      expect(dependencies).not.toHaveProperty("react-router");
      for (const file of sourceFiles(path.join(packageRoot, "src"))) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/@\/contexts|@job-radar\/discovery|react-router/);
      }
    }
  });

  it("allows only tokens as a runtime dependency of shared UI", () => {
    const tokensManifest = packageManifest("tokens");
    const uiManifest = packageManifest("ui");

    expect(tokensManifest.dependencies ?? {}).toEqual({});
    expect(uiManifest.dependencies).toEqual({
      [packages.tokens.name]: "workspace:^",
    });
  });

  it("keeps Storybook in a private documentation app", () => {
    const manifestPath = path.join(repositoryRoot, webDocs, "package.json");
    const manifest = readJson(manifestPath);

    expect(manifest.name).toBe("@job-radar/web-docs");
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies?.[packages.tokens.name]).toBe("workspace:^");
    expect(manifest.dependencies?.[packages.ui.name]).toBe("workspace:^");
    expect(existsSync(path.join(repositoryRoot, webDocs, ".storybook/main.ts"))).toBe(true);
  });

  it("prevents backend layers from importing presentation packages", () => {
    const contextRoot = path.join(repositoryRoot, "src/contexts/discovery");
    for (const role of ["domain", "application", "infrastructure"]) {
      for (const file of sourceFiles(path.join(contextRoot, role))) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/@job-radar\/(design-tokens|design-ui)/);
      }
    }
  });

  it("builds shared UI with a package-local TypeScript graph", () => {
    const configPath = path.join(repositoryRoot, packages.ui.directory, "tsconfig.json");
    const config = readJson(configPath);

    expect(config.extends).toBe("../../tsconfig.base.json");
    expect(config.compilerOptions?.paths).toBeUndefined();
    expect(config.compilerOptions?.rootDir).toBe("src");
  });

  it("prevents UI consumers from bypassing semantic tokens", () => {
    const stylesheets = [
      "packages/design-ui/src/styles.css",
      "src/contexts/discovery/presentation/web/styles.css",
    ];

    for (const stylesheet of stylesheets) {
      const source = readFileSync(path.join(repositoryRoot, stylesheet), "utf8");
      expect(source, stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source, stylesheet).not.toMatch(/\b(?:oklch|rgb|rgba|hsl|hsla)\(/i);
      expect(source, stylesheet).not.toMatch(/var\(--jr-palette-/);
      expect(source, stylesheet).not.toMatch(/\bcolor-scheme\s*:/);
      expect(source, stylesheet).not.toMatch(/font-size:\s*[^;]*(?:px|rem)/);
      expect(source, stylesheet).not.toContain("!important");

      const customProperties = [...source.matchAll(/var\((--[a-z0-9-]+)/g)].map(
        (match) => match[1],
      );
      expect(
        customProperties.every((name) => name?.startsWith("--jr-")),
        stylesheet,
      ).toBe(true);
    }
  });

  it("keeps native button styling inside the shared component package", () => {
    for (const layer of [discoveryPresentation, "src/contexts/discovery/composition/web"]) {
      for (const file of sourceFiles(path.join(repositoryRoot, layer))) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/<button\b/);
        expect(source, file).not.toMatch(
          /className=["'{][^\n]*(?:button-primary|button-secondary)/,
        );
      }
    }
  });
});

interface JsonDocument {
  readonly name?: string;
  readonly private?: boolean;
  readonly version?: string;
  readonly exports?: unknown;
  readonly extends?: string;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  readonly compilerOptions?: {
    readonly paths?: Record<string, string[]>;
    readonly rootDir?: string;
  };
}

function packageManifest(key: keyof typeof packages): JsonDocument {
  return readJson(path.join(repositoryRoot, packages[key].directory, "package.json"));
}

function readJson(file: string): JsonDocument {
  return JSON.parse(readFileSync(file, "utf8")) as JsonDocument;
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(entryPath);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}
