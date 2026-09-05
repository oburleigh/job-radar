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
const recruiterEngagementPresentation = "src/contexts/recruiter-engagement/presentation/web";
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

  it("limits shared UI runtime dependencies to tokens and the approved accessible primitive", () => {
    const tokensManifest = packageManifest("tokens");
    const uiManifest = packageManifest("ui");

    expect(tokensManifest.dependencies ?? {}).toEqual({});
    expect(uiManifest.dependencies).toEqual({
      "@base-ui/react": "1.7.0",
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

  /**
   * `pnpm verify` does not build Storybook, so nothing executes the preview. Without this the
   * gallery renders a fallback face, and every screenshot taken from it is evidence about a font
   * the product does not ship, which is what it was until this was noticed.
   */
  /**
   * A focus indicator is thicker than a border on purpose, and the widths had drifted: two rings
   * were drawing at the border token and one at a hardcoded 2px.
   */
  it("draws every focus ring at the focus width", () => {
    for (const stylesheet of tokenConsumers.filter((file) => file.endsWith(".css"))) {
      const source = readConsumer(stylesheet);
      for (const [declaration] of source.matchAll(/outline:[^;]*focus-ring[^;]*;/g)) {
        expect(declaration, stylesheet).toContain("var(--jr-focus-width)");
      }
    }
  });

  it("loads the product's typeface in the Storybook preview", () => {
    const preview = readFileSync(
      path.join(repositoryRoot, webDocs, ".storybook/preview.ts"),
      "utf8",
    );
    expect(preview).toContain("@fontsource-variable/inter");

    const manifest = readJson(path.join(repositoryRoot, webDocs, "package.json"));
    expect(manifest.dependencies?.["@fontsource-variable/inter"]).toBeDefined();
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
      "src/contexts/recruiter-engagement/presentation/web/styles.css",
    ];

    for (const stylesheet of stylesheets) {
      const source = readFileSync(path.join(repositoryRoot, stylesheet), "utf8");
      expect(source, stylesheet).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source, stylesheet).not.toMatch(/\b(?:oklch|rgb|rgba|hsl|hsla)\(/i);
      expect(source, stylesheet).not.toMatch(/var\(--jr-palette-/);
      expect(source, stylesheet).not.toMatch(/\bcolor-scheme\s*:/);
      expect(source, stylesheet).not.toMatch(/font-size:\s*[^;]*(?:px|rem)/);
      expect(source, stylesheet).not.toContain("!important");
    }
  });

  it("resolves every token its consumers name", () => {
    const declared = declaredTokens();
    expect(declared.size).toBeGreaterThan(40);

    for (const consumer of tokenConsumers) {
      for (const token of namedTokens(readConsumer(consumer))) {
        expect(declared, `${consumer} names ${token}`).toContain(token);
      }
    }
  });

  it("documents every semantic token in the gallery", () => {
    const documented = new Set(
      galleryFiles.flatMap((file) => [...namedTokens(withoutComments(readConsumer(file)))]),
    );

    for (const token of declaredTokens()) {
      if (token.startsWith("--jr-palette-")) {
        continue;
      }
      expect(documented, `${token} has no gallery entry`).toContain(token);
    }
  });

  /**
   * Separate from the gallery rule on purpose. Counting the gallery as consumption makes the
   * check circular: a token that exists only to display itself would look product-used, and a
   * token the product uses but the gallery omits would pass. This rule starts from what the
   * product reads and follows the theme's own aliases outwards from there, so a role reachable
   * only from another unread role is not counted either.
   */
  it("retires a token rather than leaving it declared with no product consumer", () => {
    const consumed = consumedFromProduct();

    for (const token of declaredTokens()) {
      if (token.startsWith("--jr-palette-") || token in publishedWithoutConsumer) {
        continue;
      }
      expect(consumed, `${token} is declared but no product code reads it`).toContain(token);
    }
  });

  it("gives every published-but-unread token a stated reason", () => {
    const declared = declaredTokens();
    for (const [token, reason] of Object.entries(publishedWithoutConsumer)) {
      expect(declared, `${token} is excused but not declared`).toContain(token);
      expect(reason.trim().length, `${token} is excused without a reason`).toBeGreaterThan(8);
    }
  });

  /**
   * The resolver above only recognises names that already begin `--jr-`, so without this a
   * `var(--jrr-color-text)` or a bare `var(--color-text)` escapes it entirely and paints
   * nothing. Every custom property the product reads is either a published token or one of the
   * few values the product itself sets at runtime.
   */
  it("reads no custom property the token layer does not declare", () => {
    const declared = declaredTokens();

    for (const file of productSources()) {
      const source = readFileSync(file, "utf8");
      // Matched through the closing delimiter rather than to the first character outside
      // `[a-z0-9-]`, so `var(--jr-color-text_extra)` is not silently read as `--jr-color-text`.
      for (const [, property] of withoutComments(source).matchAll(/var\(\s*(--[^\s,)]+)/g)) {
        const name = property as string;
        expect(
          declared.has(name) || productLocalProperties.has(name),
          `${path.relative(repositoryRoot, file)} reads ${name}`,
        ).toBe(true);
      }
    }
  });

  /**
   * Colour and type size were gated; spacing, corner radius and stacking were not. That is where
   * every alignment defect lived: 200 raw pixel values across the two product stylesheets, whose
   * most common value was 18px, which the nine-step scale does not contain. A page carried four to
   * six left edges as a result.
   */
  it("keeps spacing, radius and stacking in the token layer", () => {
    for (const stylesheet of tokenConsumers.filter((file) => file.endsWith(".css"))) {
      const source = readConsumer(stylesheet);

      expect(source, `${stylesheet} sets spacing in raw pixels`).not.toMatch(
        /(?:padding|margin|gap)[a-z-]*:[^;]*\b\d+px/,
      );
      expect(source, `${stylesheet} sets a corner radius in raw pixels`).not.toMatch(
        /border-radius:[^;]*\b\d+px/,
      );
      expect(source, `${stylesheet} sets a raw stacking order`).not.toMatch(/z-index:\s*\d/);
    }
  });

  it("keeps type weight in the token layer", () => {
    for (const stylesheet of tokenConsumers) {
      const source = readFileSync(path.join(repositoryRoot, stylesheet), "utf8");
      expect(source, stylesheet).not.toMatch(/font-weight:\s*(?:\d|bold|bolder|lighter)/);
    }
  });

  /**
   * The scale publishes a line height per size, which is only real if a rule that sets one sets
   * the other. `body` carries a length rather than the ratio it used to, so a block naming only
   * a font size inherits a 24px line box: measured, a 12px label took 24px of leading and pushed
   * one column of the recruiter brief 15px out of alignment with its neighbour.
   */
  it("pairs every type size with its own line height", () => {
    for (const stylesheet of tokenConsumers.filter((file) => file.endsWith(".css"))) {
      for (const block of readConsumer(stylesheet).match(/\{[^{}]*\}/g) ?? []) {
        const size = /font-size: var\(--jr-font-size-([a-z0-9-]+)\)/.exec(block);
        if (size === null) {
          continue;
        }
        expect(block, `${stylesheet}: ${size[1]} needs its paired line height`).toContain(
          `line-height: var(--jr-line-height-${size[1]});`,
        );
      }
    }
  });

  it("documents every shared component in Storybook", () => {
    const barrel = readFileSync(
      path.join(repositoryRoot, packages.ui.directory, "src/index.ts"),
      "utf8",
    );
    const exported = new Set(
      [...barrel.matchAll(/export\s*\{([^}]*)\}\s*from/g)]
        .flatMap((match) => (match[1] ?? "").split(","))
        .map((name) => name.trim())
        .filter((name) => /^[A-Z][A-Za-z]*$/.test(name)),
    );
    expect(exported.size).toBeGreaterThan(10);

    const storied = new Set(
      sourceFiles(path.join(repositoryRoot, webDocs, "src"))
        .filter((file) => file.endsWith(".stories.tsx"))
        .flatMap((file) => {
          const source = readFileSync(file, "utf8");
          const importBlock = /import\s*\{([^}]*)\}\s*from\s*["']@job-radar\/design-ui["']/.exec(
            source,
          );
          return importBlock?.[1] ? importBlock[1].split(",").map((name) => name.trim()) : [];
        }),
    );

    for (const component of exported) {
      expect(storied, `${component} has no Storybook story`).toContain(component);
      expect(
        renderedInAStory(component),
        `${component} is imported by a story file but no exported story renders it`,
      ).toBe(true);
    }
  });

  it("keeps native button styling inside the shared component package", () => {
    for (const layer of [
      discoveryPresentation,
      recruiterEngagementPresentation,
      "src/contexts/discovery/composition/web",
      "src/contexts/recruiter-engagement/composition/web",
    ]) {
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

/** The gallery, which documents tokens. It is deliberately not counted as consumption. */
const galleryFiles = [
  `${webDocs}/src/tokens.stories.tsx`,
  `${webDocs}/src/components.stories.tsx`,
] as const;

/**
 * Published for completeness of a scale rather than used yet, each with the reason it has no
 * product consumer. A token added here without one is the thing the rule exists to stop.
 */
const publishedWithoutConsumer: Record<string, string> = {
  "--jr-color-success-border": "the success callout's edge, which now separates by tint",
  "--jr-ease-drawer": "no drawer or sheet exists yet",
  "--jr-ease-in-out": "nothing moves across the screen yet",
  "--jr-font-size-lg": "the lead size, unused until a route has a lead paragraph",
  "--jr-line-height-lg": "paired with the lead size",
  "--jr-font-weight-light": "display sizes only, and no route sets a display title yet",
  "--jr-radius-xs": "chips and inline marks",
};

/** Set by the product at runtime rather than declared by the token layer. */
const productLocalProperties = new Set([
  "--discovery-notice-hold-duration",
  "--transform-origin", // provided by Base UI on its positioned surfaces
]);

const tokenConsumers = [
  "packages/design-ui/src/styles.css",
  `${discoveryPresentation}/styles.css`,
  `${recruiterEngagementPresentation}/styles.css`,
  `${webDocs}/src/tokens.stories.tsx`,
  `${webDocs}/src/components.stories.tsx`,
] as const;

function readTheme(): string {
  return readFileSync(
    path.join(repositoryRoot, packages.tokens.directory, "src/theme.css"),
    "utf8",
  );
}

/** Every stylesheet and component the product ships, which is the surface criterion 2 claims. */
function productSources(): string[] {
  return [path.join(repositoryRoot, "packages/design-ui/src"), path.join(repositoryRoot, "src")]
    .flatMap((root) => styleAndSourceFiles(root))
    .filter((file) => !/\.(?:test|spec)\.[jt]sx?$/.test(file));
}

/**
 * Reads the product makes, expanded through the theme's own aliases. A role the product never
 * names counts only if some role it does name resolves to it.
 */
function consumedFromProduct(): ReadonlySet<string> {
  const theme = withoutComments(readTheme());
  /*
   * Accumulated rather than assigned: a token is declared twice when a media block overrides it,
   * and the override carries no `var()`. Replacing drops the base declaration's alias, which is
   * how `--jr-motion-duration-fast` first read as unused.
   */
  const aliases = new Map<string, string[]>();
  for (const [, name, value] of theme.matchAll(/^\s*(--jr-[a-z0-9-]+)\s*:([^;]*);/gm)) {
    const referenced = [...(value as string).matchAll(/var\((--jr-[a-z0-9-]+)/g)].map(
      (match) => match[1] as string,
    );
    aliases.set(name as string, [...(aliases.get(name as string) ?? []), ...referenced]);
  }

  const pending = productSources().flatMap((file) => [
    ...varReads(withoutComments(readFileSync(file, "utf8"))),
  ]);
  const consumed = new Set<string>();
  while (pending.length > 0) {
    const token = pending.pop() as string;
    if (consumed.has(token)) {
      continue;
    }
    consumed.add(token);
    pending.push(...(aliases.get(token) ?? []));
  }
  return consumed;
}

/** `var(--jr-x)` reads only, so a token named in prose or in a dead string does not count. */
function varReads(source: string): ReadonlySet<string> {
  return new Set(
    [...source.matchAll(/var\((--jr-[a-z0-9-]+)/g)].map((match) => match[1] as string),
  );
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function styleAndSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return styleAndSourceFiles(entryPath);
    }
    return /\.(?:css|tsx?)$/.test(entry.name) ? [entryPath] : [];
  });
}

/**
 * Scoped to the bodies of exported stories, with comments stripped first. Scanning the whole
 * file let an unused top-level `const example = <Button />`, or a comment naming the component,
 * stand in for a story that renders it.
 */
function renderedInAStory(component: string): boolean {
  const rendered = new RegExp(`<${component}[\\s/>]`);
  return sourceFiles(path.join(repositoryRoot, webDocs, "src"))
    .filter((file) => file.endsWith(".stories.tsx"))
    .flatMap((file) => exportedStoryBodies(withoutComments(readFileSync(file, "utf8"))))
    .some((body) => rendered.test(body));
}

function exportedStoryBodies(source: string): string[] {
  const bodies: string[] = [];
  for (const match of source.matchAll(/export const [A-Za-z]+: Story = \{/g)) {
    const start = match.index ?? 0;
    let depth = 0;
    for (let index = start + match[0].length - 1; index < source.length; index += 1) {
      if (source[index] === "{") {
        depth += 1;
      } else if (source[index] === "}") {
        depth -= 1;
        if (depth === 0) {
          bodies.push(source.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return bodies;
}

function readConsumer(consumer: string): string {
  return readFileSync(path.join(repositoryRoot, consumer), "utf8");
}

function declaredTokens(): ReadonlySet<string> {
  return new Set(
    [...readTheme().matchAll(/^\s*(--jr-[a-z0-9-]+)\s*:/gm)].map((match) => match[1] as string),
  );
}

/**
 * Consumers never declare a token, which "prevents UI consumers from bypassing semantic tokens"
 * holds for the stylesheets and the gallery only reads them, so every mention is a reference.
 * Matching the bare name rather than `var(...)` is what lets the gallery's `var(${token})` count.
 */
function namedTokens(source: string): ReadonlySet<string> {
  return new Set([...source.matchAll(/--jr-[a-z0-9-]+/g)].map((match) => match[0]));
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
