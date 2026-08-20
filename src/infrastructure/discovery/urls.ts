import { createHash } from "node:crypto";

import type {
  AtsType,
  BoardIdentity,
  ClassifiedUrl,
} from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { isBuiltInAtsType } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import {
  getAtsIntegration,
  getJobRadarConfig,
  hostMatches,
} from "@/infrastructure/config/job-radar";

const IDENTITY_QUERY_KEYS = new Set(["for", "gh_jid"]);

export function canonicalizeUrl(value: string): string {
  const input = value.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`);

  url.protocol = ["http:", "https:"].includes(url.protocol) ? url.protocol.toLowerCase() : "https:";
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";

  const identityQuery = new URLSearchParams();
  for (const [key, queryValue] of [...url.searchParams.entries()].sort()) {
    if (IDENTITY_QUERY_KEYS.has(key.toLowerCase())) {
      identityQuery.set(key, queryValue);
    }
  }
  url.search = identityQuery.toString();

  return url.toString().replace(/\/$/, "");
}

export function classifyUrl(value: string): ClassifiedUrl | null {
  let canonicalUrl: string;
  try {
    canonicalUrl = canonicalizeUrl(value);
  } catch {
    return null;
  }

  const url = new URL(canonicalUrl);
  const host = url.hostname;
  const parts = url.pathname.split("/").filter(Boolean);

  if (hostMatches("ashby", host) && parts[0]) {
    return classified(
      "ashby",
      canonicalUrl,
      parts[1] ?? "",
      board("ashby", parts[0], `${url.origin}/${parts[0]}`),
    );
  }

  if (hostMatches("greenhouse", host) && parts[0]) {
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

  if (hostMatches("lever", host) && parts[0]) {
    return classified(
      "lever",
      canonicalUrl,
      parts[1] ?? "",
      board("lever", parts[0], `https://${host}/${parts[0]}`, {
        region: host.startsWith("jobs.eu.") ? "eu" : "global",
      }),
    );
  }

  const bambooConfig = getAtsIntegration("bamboohr");
  if (bambooConfig.hostnames.includes(host) && parts[0]) {
    const slug = parts[0];
    return classified(
      "bamboohr",
      canonicalUrl,
      pathId(parts, "careers") ?? "",
      board("bamboohr", slug, `https://${slug}${bambooConfig.hostSuffixes[0] ?? ""}/careers`),
    );
  }

  if (hostMatches("bamboohr", host) && !bambooConfig.hostnames.includes(host)) {
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

  if (hostMatches("workable", host) && parts[0]) {
    return classified(
      "workable",
      canonicalUrl,
      pathId(parts, "j") ?? parts[1] ?? "",
      board("workable", parts[0], `${url.origin}/${parts[0]}`),
    );
  }

  if (hostMatches("smartrecruiters", host) && parts[0]) {
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

  if (hostMatches("workday", host)) {
    return classifyWorkday(canonicalUrl, host, parts);
  }

  if (hostMatches("icims", host)) {
    const suffix =
      getAtsIntegration("icims").hostSuffixes.find((item) => host.endsWith(item)) ?? "";
    const slug = host.replace(new RegExp(`${escapeRegExp(suffix)}$`), "");
    return classified(
      "icims",
      canonicalUrl,
      pathId(parts, "jobs") ?? "",
      board("icims", slug, `${url.origin}/jobs/search`),
    );
  }

  if (hostMatches("jobvite", host) && parts[0]) {
    return classified(
      "jobvite",
      canonicalUrl,
      pathId(parts, "job") ?? "",
      board("jobvite", parts[0], `${url.origin}/${parts[0]}`),
    );
  }

  if (hostMatches("linkedin", host) && parts[0] === "jobs" && parts[1] === "view" && parts[2]) {
    const numericParts = [...parts[2].matchAll(/\d+/g)];
    const externalId = numericParts.at(-1)?.[0] ?? parts[2];
    return classified("linkedin", canonicalUrl, externalId, null);
  }

  const customIntegration = Object.entries(getJobRadarConfig().ats)
    .filter(([atsType]) => !isBuiltInAtsType(atsType))
    .sort(([, left], [, right]) => left.priority - right.priority)
    .find(
      ([, integration]) =>
        integration.hostnames.includes(host) ||
        integration.hostSuffixes.some((suffix) => host.endsWith(suffix)),
    );
  if (customIntegration) {
    return classified(customIntegration[0], canonicalUrl, parts.at(-1) ?? "", null);
  }

  return null;
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

  const jobIndex = parts.indexOf("job");
  const externalId = jobIndex >= 0 ? (parts.at(-1) ?? "") : (parts.at(-1) ?? "");
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
  return {
    atsType,
    canonicalUrl,
    externalId,
    board: boardIdentity,
  };
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
