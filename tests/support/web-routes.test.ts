import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { allRouteModules, auditableRoutes, dynamicSegments } from "./web-routes";

const CONTEXTS_DIRECTORY = path.join(process.cwd(), "src", "contexts");

describe("web route enumeration", () => {
  it("resolves every route module to a file that exists", () => {
    const missing = allRouteModules().filter(
      (modulePath) => !existsSync(path.join(process.cwd(), modulePath)),
    );

    expect(missing).toEqual([]);
  });

  it("covers every context that owns document routes", () => {
    const enumerated = new Set(auditableRoutes().map((route) => contextOf(route.modulePath)));

    expect([...enumerated].sort()).toEqual(contextsOwningDocumentRoutes());
  });

  it("enumerates every document route module the config references", () => {
    const fromConfig = allRouteModules().filter((modulePath) => modulePath.endsWith(".tsx"));

    expect(
      auditableRoutes()
        .map((route) => route.modulePath)
        .sort(),
    ).toEqual([...fromConfig].sort());
  });

  it("excludes resource routes without excluding any document route", () => {
    const excluded = allRouteModules().filter((modulePath) => !modulePath.endsWith(".tsx"));

    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.every((modulePath) => modulePath.endsWith(".ts"))).toBe(true);
  });

  it("names the dynamic segment of every parameterised route", () => {
    const parameterised = auditableRoutes().filter((route) => route.urlPath.includes(":"));

    expect(parameterised.length).toBeGreaterThan(0);
    for (const route of parameterised) {
      expect(dynamicSegments(route.urlPath)).not.toEqual([]);
    }
  });

  it("reports no dynamic segment for a route that has none", () => {
    expect(dynamicSegments("/settings/opportunities")).toEqual([]);
  });
});

function contextOf(modulePath: string): string {
  const segments = modulePath.split(path.sep);
  const index = segments.indexOf("contexts");

  if (index === -1 || !segments[index + 1]) {
    throw new Error(`Route module sits outside a bounded context: ${modulePath}`);
  }

  return segments[index + 1] as string;
}

function contextsOwningDocumentRoutes(): string[] {
  return readdirSync(CONTEXTS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((context) => {
      const routesDirectory = path.join(
        CONTEXTS_DIRECTORY,
        context,
        "composition",
        "web",
        "routes",
      );
      return (
        existsSync(routesDirectory) &&
        readdirSync(routesDirectory).some(
          (file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"),
        )
      );
    })
    .sort();
}
