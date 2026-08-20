import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const packages = {
  tokens: {
    directory: "packages/design-system/tokens",
    name: "@job-radar/design-tokens",
  },
  ui: {
    directory: "packages/design-system/ui",
    name: "@job-radar/ui",
  },
  discoveryUi: {
    directory: "packages/discovery/ui",
    name: "@job-radar/discovery-ui",
  },
} as const;

describe("design system package boundaries", () => {
  it("declares independently versioned leaf packages", () => {
    for (const workspacePackage of Object.values(packages)) {
      const manifestPath = path.join(repositoryRoot, workspacePackage.directory, "package.json");
      expect(existsSync(manifestPath), workspacePackage.name).toBe(true);

      const manifest = readJson(manifestPath);
      expect(manifest.name).toBe(workspacePackage.name);
      expect(manifest.private).not.toBe(true);
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(manifest.exports).toBeDefined();
    }
  });

  it("keeps generic packages free of Discovery and routing dependencies", () => {
    for (const packageKey of ["tokens", "ui"] as const) {
      const workspacePackage = packages[packageKey];
      const packageRoot = path.join(repositoryRoot, workspacePackage.directory);
      const manifest = readJson(path.join(packageRoot, "package.json"));
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.peerDependencies,
      };

      expect(dependencies).not.toHaveProperty("@job-radar/discovery-ui");
      expect(dependencies).not.toHaveProperty("react-router");

      for (const file of sourceFiles(path.join(packageRoot, "src"))) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(/@\/contexts\/discovery|@job-radar\/discovery-ui/);
        expect(source, file).not.toMatch(/from ["']react-router["']/);
      }
    }
  });

  it("allows only inward design-system dependencies", () => {
    const tokensManifest = packageManifest("tokens");
    const uiManifest = packageManifest("ui");
    const discoveryUiManifest = packageManifest("discoveryUi");

    expect(tokensManifest.dependencies ?? {}).toEqual({});
    expect(uiManifest.dependencies?.[packages.tokens.name]).toBe("workspace:^");
    expect(discoveryUiManifest.dependencies?.[packages.tokens.name]).toBe("workspace:^");
    expect(discoveryUiManifest.dependencies?.[packages.ui.name]).toBe("workspace:^");
  });

  it("keeps Storybook with the generic UI owner and Changesets at the workspace root", () => {
    expect(existsSync(path.join(repositoryRoot, packages.ui.directory, ".storybook/main.ts"))).toBe(
      true,
    );
    expect(existsSync(path.join(repositoryRoot, ".changeset/config.json"))).toBe(true);
  });
});

interface PackageManifest {
  readonly name?: string;
  readonly private?: boolean;
  readonly version?: string;
  readonly exports?: unknown;
  readonly dependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
}

function packageManifest(key: keyof typeof packages): PackageManifest {
  return readJson(path.join(repositoryRoot, packages[key].directory, "package.json"));
}

function readJson(file: string): PackageManifest {
  return JSON.parse(readFileSync(file, "utf8")) as PackageManifest;
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
