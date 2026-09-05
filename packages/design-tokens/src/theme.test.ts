import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const theme = readFileSync(
  path.resolve(process.cwd(), "packages/design-tokens/src/theme.css"),
  "utf8",
);

const sizes = ["caption", "sm", "body", "lg", "title", "heading", "display"] as const;

describe("design token contract", () => {
  it("authors the colour system in OKLCH", () => {
    expect(theme).toContain("oklch(");
    expect(theme).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(theme).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/i);
  });

  it("separates primitive values from semantic colour roles", () => {
    expect(theme).toContain("--jr-palette-");
    expect(theme).toContain("--jr-color-");
    expect(theme).toContain("light-dark(");
    expect(theme).toContain("color-mix(in oklch");
  });

  it("namespaces every public custom property", () => {
    const declarations = [...theme.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]);

    expect(declarations.length).toBeGreaterThan(40);
    expect(declarations.every((name) => name?.startsWith("--jr-"))).toBe(true);
  });

  it("supports system, explicit light, and explicit dark themes from one token graph", () => {
    expect(theme).toMatch(/:root\s*\{[\s\S]*color-scheme:\s*light dark/);
    expect(theme).toMatch(/:root\[data-theme="light"\][\s\S]*color-scheme:\s*light/);
    expect(theme).toMatch(/:root\[data-theme="dark"\][\s\S]*color-scheme:\s*dark/);
  });

  it("pairs a line height with every type size", () => {
    for (const size of sizes) {
      expect(theme, size).toMatch(new RegExp(`--jr-font-size-${size}:`));
      expect(theme, size).toMatch(new RegExp(`--jr-line-height-${size}:`));
    }

    const declaredSizes = [...theme.matchAll(/--jr-font-size-([a-z0-9-]+):/g)].map(
      (match) => match[1],
    );
    expect(declaredSizes.sort()).toEqual([...sizes].sort());
  });

  it("publishes a body weight, which the product previously could not set", () => {
    expect(theme).toContain("--jr-font-weight-regular: 400");
    expect(theme).toContain("--jr-font-weight-light: 300");
    expect(theme).not.toContain("--jr-font-weight-bold");
  });

  /**
   * The block used to set all four duration tokens to `0ms`, which removed the colour and opacity
   * fades that tell a reduced-motion user their action landed. It now removes movement only, and
   * `e2e/design-system.spec.ts` proves that against a browser resolving the media query.
   */
  it("removes movement for reduced-motion users without removing state fades", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n {2}\}/.exec(theme);
    expect(block?.[1]).toBeDefined();
    const reduced = block?.[1] ?? "";

    expect(reduced).toContain("--jr-motion-transform-fast: 0ms");
    expect(reduced).toContain("--jr-motion-transform-base: 0ms");
    expect(reduced).not.toMatch(/--jr-motion-duration-[a-z]+:/);
    expect(reduced).not.toContain("0.01ms");
    expect(reduced).not.toContain("!important");
  });
});
