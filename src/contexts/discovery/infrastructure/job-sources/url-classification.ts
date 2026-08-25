import { createHash } from "node:crypto";

import type {
  AtsType,
  BoardIdentity,
  ClassifiedUrl,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { isBuiltInAtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

export interface AtsUrlIntegrationConfig {
  readonly hostnames: readonly string[];
  readonly hostSuffixes: readonly string[];
  readonly priority: number;
}

const identityQueryKeys = new Set(["for", "gh_jid"]);

export function canonicalizeUrl(value: string): string {
  const input = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);

  url.protocol = ["http:", "https:"].includes(url.protocol) ? url.protocol.toLowerCase() : "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";

  const identityQuery = new URLSearchParams();
  for (const [key, queryValue] of [...url.searchParams.entries()].sort()) {
    if (identityQueryKeys.has(key.toLowerCase())) {
      identityQuery.set(key, queryValue);
    }
  }
  url.search = identityQuery.toString();

  return url.toString().replace(/\/$/, "");
}

export function classifyUrlWithConfig(
  value: string,
  integrations: Readonly<Record<string, AtsUrlIntegrationConfig>>,
): ClassifiedUrl | null {
  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(value);
  } catch {
    return null;
  }

  const url = new URL(canonicalUrl);
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);
  const matchesHost = (atsType: string) => hostMatches(integrations, atsType, host);
  const greenhousePostingId = url.searchParams.get("gh_jid") ?? "";

  if (greenhousePostingId && /^\d+$/.test(greenhousePostingId) && !matchesHost("greenhouse")) {
    return classified("greenhouse", canonicalUrl, greenhousePostingId, null);
  }

  if (matchesHost("ashby") && parts[0]) {
    return classified(
      "ashby",
      canonicalUrl,
      parts[1] ?? "",
      board("ashby", parts[0], `${url.origin}/${parts[0]}`),
    );
  }

  if (matchesHost("greenhouse") && parts[0]) {
    const slug = parts[0] === "embed" ? (url.searchParams.get("for") ?? "") : parts[0];
    if (!slug) {
      return null;
    }
    const externalId = pathId(parts, "jobs") ?? url.searchParams.get("gh_jid") ?? "";
    return classified(
      "greenhouse",
      canonicalUrl,
      externalId,
      board("greenhouse", slug, `https://${host}/${slug}`),
    );
  }

  if (matchesHost("lever") && parts[0]) {
    return classified(
      "lever",
      canonicalUrl,
      parts[1] ?? "",
      board("lever", parts[0], `https://${host}/${parts[0]}`, {
        region: host.startsWith("jobs.eu.") ? "eu" : "global",
      }),
    );
  }

  const bambooConfig = integrationFor(integrations, "bamboohr");
  if (bambooConfig.hostnames.includes(host) && parts[0]) {
    const slug = parts[0];
    return classified(
      "bamboohr",
      canonicalUrl,
      pathId(parts, "careers") ?? "",
      board("bamboohr", slug, `https://${slug}${bambooConfig.hostSuffixes[0] ?? ""}/careers`),
    );
  }

  if (matchesHost("bamboohr") && !bambooConfig.hostnames.includes(host)) {
    const suffix = bambooConfig.hostSuffixes.find((item) => host.endsWith(item)) ?? "";
    const slug = host.replace(new RegExp(`${escapeRegExp(suffix)}$`), "").split(".")[0];
    if (slug) {
      return classified(
        "bamboohr",
        canonicalUrl,
        pathId(parts, "careers") ?? "",
        board("bamboohr", slug, `${url.origin}/careers`),
      );
    }
  }

  if (matchesHost("workable") && parts[0]) {
    return classified(
      "workable",
      canonicalUrl,
      pathId(parts, "j") ?? parts[1] ?? "",
      board("workable", parts[0], `${url.origin}/${parts[0]}`),
    );
  }

  if (matchesHost("smartrecruiters") && parts[0]) {
    const jobPath = parts[1] ?? "";
    const externalId =
      jobPath.match(/^\d{6,}/)?.[0] ??
      jobPath.match(/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}/i)?.[0] ??
      jobPath;
    return classified(
      "smartrecruiters",
      canonicalUrl,
      externalId,
      board("smartrecruiters", parts[0], `${url.origin}/${parts[0]}`),
    );
  }

  if (matchesHost("workday")) {
    return classifyWorkday(canonicalUrl, host, parts);
  }

  if (matchesHost("icims")) {
    const suffix =
      integrationFor(integrations, "icims").hostSuffixes.find((item) => host.endsWith(item)) ?? "";
    const slug = host.replace(new RegExp(`${escapeRegExp(suffix)}$`), "");
    return classified(
      "icims",
      canonicalUrl,
      pathId(parts, "jobs") ?? "",
      board("icims", slug, `${url.origin}/jobs/search`),
    );
  }

  if (matchesHost("jobvite") && parts[0]) {
    return classified(
      "jobvite",
      canonicalUrl,
      pathId(parts, "job") ?? "",
      board("jobvite", parts[0], `${url.origin}/${parts[0]}`),
    );
  }

  if (matchesHost("linkedin") && parts[0] === "jobs" && parts[1] === "view" && parts[2]) {
    const numericParts = [...parts[2].matchAll(/\d+/g)];
    return classified("linkedin", canonicalUrl, numericParts.at(-1)?.[0] ?? parts[2], null);
  }

  const customIntegration = Object.entries(integrations)
    .filter(([atsType]) => !isBuiltInAtsType(atsType))
    .sort(([, left], [, right]) => left.priority - right.priority)
    .find(
      ([, integration]) =>
        integration.hostnames.includes(host) ||
        integration.hostSuffixes.some((suffix) => host.endsWith(suffix)),
    );
  return customIntegration
    ? classified(customIntegration[0], canonicalUrl, parts.at(-1) ?? "", null)
    : null;
}

export function makeDedupeKey(
  atsType: AtsType,
  canonicalUrl: string,
  externalId = "",
  boardKey = "",
): string {
  const identity =
    externalId && (boardKey || atsType === "linkedin")
      ? `${atsType}|${boardKey}|${externalId}`
      : `${atsType}|${canonicalizeUrl(canonicalUrl)}`;
  return createHash("sha256").update(identity).digest("hex");
}

function hostMatches(
  integrations: Readonly<Record<string, AtsUrlIntegrationConfig>>,
  atsType: string,
  hostname: string,
): boolean {
  const integration = integrationFor(integrations, atsType);
  return (
    integration.hostnames.includes(hostname) ||
    integration.hostSuffixes.some((suffix) => hostname.endsWith(suffix))
  );
}

function integrationFor(
  integrations: Readonly<Record<string, AtsUrlIntegrationConfig>>,
  atsType: string,
): AtsUrlIntegrationConfig {
  const integration = integrations[atsType];
  if (!integration) {
    throw new Error(`Missing ${atsType} integration configuration`);
  }
  return integration;
}

function classifyWorkday(canonicalUrl: string, host: string, parts: string[]): ClassifiedUrl {
  const hostParts = host.replace(/\.myworkdayjobs\.com$/, "").split(".");
  let tenant = hostParts[0] ?? "";
  let site = "External";

  if (parts[0] === "wday" && parts[1] === "cxs" && parts[2] && parts[3]) {
    tenant = parts[2];
    site = parts[3];
  } else if (parts[0]) {
    site = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(parts[0]) && parts[1] ? parts[1] : parts[0];
  }

  const externalId = parts.at(-1) ?? "";
  const config: Record<string, string> = { host, tenant, site };
  const dataCenter = hostParts.find((part) => /^wd\d+$/.test(part));
  if (dataCenter) {
    config.dataCenter = dataCenter;
  }

  return classified("workday", canonicalUrl, externalId, {
    atsType: "workday",
    canonicalKey: `workday:${host}:${tenant}:${site}`.toLowerCase(),
    slug: tenant,
    baseUrl: `https://${host}/${site}`,
    config,
  });
}

function classified(
  atsType: AtsType,
  canonicalUrl: string,
  externalId: string,
  boardIdentity: BoardIdentity | null,
): ClassifiedUrl {
  return { atsType, canonicalUrl, externalId, board: boardIdentity };
}

function board(
  atsType: AtsType,
  slug: string,
  baseUrl: string,
  config: Record<string, string> = {},
): BoardIdentity {
  return {
    atsType,
    canonicalKey: `${atsType}:${slug}`.toLowerCase(),
    slug,
    baseUrl,
    config,
  };
}

function pathId(parts: string[], marker: string): string | null {
  const index = parts.indexOf(marker);
  return index >= 0 ? (parts[index + 1] ?? null) : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
