import { readFileSync } from "node:fs";
import path from "node:path";

import type { RouteConfigEntry } from "@react-router/dev/routes";

import appRoutes from "@/contexts/discovery/composition/web/routes";

/**
 * A route the audit can navigate to and measure. Resource routes are excluded because they
 * return data rather than a document; they are identified by their module extension, not by a
 * list, so a new resource route needs no change here.
 */
export type AuditableRoute = {
  readonly urlPath: string;
  readonly modulePath: string;
};

const APP_DIRECTORY = readAppDirectory();

export function auditableRoutes(): AuditableRoute[] {
  const collected = collect(appRoutes as RouteConfigEntry[], "");
  const auditable = collected.filter((entry) => entry.modulePath.endsWith(".tsx"));

  if (auditable.length === 0) {
    throw new Error(
      "The route enumeration found no document routes. The audit would then pass by measuring nothing.",
    );
  }

  return auditable;
}

/**
 * Every route module the enumeration walked, document and resource alike. The audit asserts the
 * routes it reached against this, so a route that redirects or fails cannot drop out silently.
 */
export function allRouteModules(): readonly string[] {
  return collect(appRoutes as RouteConfigEntry[], "").map((entry) => entry.modulePath);
}

/**
 * The parameter names a route needs before it can be navigated. The audit requires a sample value
 * for each, so a new parameterised route fails loudly rather than dropping out of the sweep.
 */
export function dynamicSegments(urlPath: string): string[] {
  return urlPath
    .split("/")
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
}

function collect(entries: readonly RouteConfigEntry[], parentPath: string): AuditableRoute[] {
  const routes: AuditableRoute[] = [];

  for (const entry of entries) {
    const urlPath = joinPath(parentPath, entry.path);
    routes.push({ urlPath, modulePath: path.join(APP_DIRECTORY, entry.file) });

    if (entry.children) {
      routes.push(...collect(entry.children, urlPath));
    }
  }

  return routes;
}

function joinPath(parentPath: string, segment: string | undefined): string {
  if (segment === undefined || segment === "") {
    return parentPath === "" ? "/" : parentPath;
  }

  const base = parentPath === "/" ? "" : parentPath;
  return `${base}/${segment}`;
}

function readAppDirectory(): string {
  const configPath = path.join(process.cwd(), "react-router.config.ts");
  const source = readFileSync(configPath, "utf8");
  const match = /appDirectory:\s*"([^"]+)"/.exec(source);

  if (!match?.[1]) {
    throw new Error(
      `react-router.config.ts declares no appDirectory, so route modules cannot be resolved: ${configPath}`,
    );
  }

  return match[1];
}
