import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { extractAnnualSalaryFromText } from "@/contexts/discovery/infrastructure/job-sources/annual-salary-parser";
import type {
  AtsType,
  RawJob,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";

type Database = typeof db;

export type StructuredJobPageLookup =
  | { status: "verified"; job: RawJob }
  | { status: "closed"; reason: "closed-marker" | "expired" }
  | { status: "not_found"; reason: "not-found" }
  | {
      status: "unavailable";
      reason:
        | "missing-external-id"
        | "protected"
        | "request-failed"
        | "unsupported-source"
        | "unstructured";
    };

export function supportsStructuredJobPage(atsType: AtsType, database: Database = db): boolean {
  return getJobRadarConfig(database).discovery.structuredVerificationSources.includes(atsType);
}

export async function fetchStructuredJobPage(
  atsType: AtsType,
  externalId: string,
  canonicalUrl: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<StructuredJobPageLookup> {
  if (!supportsStructuredJobPage(atsType)) {
    return { status: "unavailable", reason: "unsupported-source" };
  }
  if (!externalId) {
    return { status: "unavailable", reason: "missing-external-id" };
  }

  const config = getJobRadarConfig();
  let response: Response;
  try {
    response = await fetcher(canonicalUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": config.network.userAgent,
      },
      signal: AbortSignal.timeout(config.network.timeoutMs),
    });
  } catch {
    return { status: "unavailable", reason: "request-failed" };
  }
  if (response.status === 404 || response.status === 410) {
    return { status: "not_found", reason: "not-found" };
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return { status: "unavailable", reason: "protected" };
  }
  if (!response.ok) {
    return { status: "unavailable", reason: "request-failed" };
  }

  const html = await response.text();
  const normalizedPage = stripHtml(html).toLowerCase();
  const hasClosedMarker = config.discovery.closedListingMarkers.some((marker) =>
    normalizedPage.includes(marker),
  );

  const posting = extractJobPosting(html);
  if (!posting) {
    return hasClosedMarker
      ? { status: "closed", reason: "closed-marker" }
      : { status: "unavailable", reason: "unstructured" };
  }
  const validThrough = parseDate(posting.validThrough);
  if (validThrough && validThrough.getTime() < now.getTime()) {
    return { status: "closed", reason: "expired" };
  }
  if (hasClosedMarker) {
    return { status: "closed", reason: "closed-marker" };
  }

  const title = stringValue(posting.title);
  const organization = asRecord(posting.hiringOrganization);
  const companyName = stringValue(organization.name);
  if (!title || !companyName) {
    const missingFields = [
      ...(!title ? ["title"] : []),
      ...(!companyName ? ["hiringOrganization.name"] : []),
    ];
    throw new Error(
      `Invalid schema.org JobPosting at ${canonicalUrl}: missing ${missingFields.join(", ")}`,
    );
  }

  const remote = stringArray(posting.jobLocationType).some(
    (value) => value.toUpperCase() === "TELECOMMUTE",
  );
  const applicantLocations = locationNames(posting.applicantLocationRequirements);
  const jobLocations = locationNames(posting.jobLocation);
  const locations = uniqueStrings([
    ...applicantLocations,
    ...jobLocations,
    ...(remote && applicantLocations.length === 0 && jobLocations.length === 0 ? ["Remote"] : []),
  ]);
  const description = stripHtml(stringValue(posting.description));

  return {
    status: "verified",
    job: {
      atsType,
      externalId,
      canonicalUrl,
      applyUrl: stringValue(posting.url) || canonicalUrl,
      title,
      companyName,
      locations,
      description,
      department: stringValue(posting.industry),
      employmentType: stringArray(posting.employmentType).join(", "),
      workplaceType: remote ? "remote" : "",
      publishedAt: parseDate(posting.datePosted),
      publishedSalary: extractAnnualSalaryFromText(description),
      evidence: "structured",
      rawPayload: {
        ...posting,
        verifiedAt: now.toISOString(),
        verifiedSource: "schema.org/JobPosting",
      },
    },
  };
}

function extractJobPosting(html: string): Record<string, unknown> | null {
  const scriptPattern =
    /<script\b[^>]*type\s*=\s*(?:["']application\/ld\+json["']|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const text = (match[1] ?? "").trim();
    if (!text) {
      continue;
    }
    try {
      const posting = findJobPosting(JSON.parse(text) as unknown);
      if (posting) {
        return posting;
      }
    } catch {}
  }
  return null;
}

function findJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const posting = findJobPosting(item);
      if (posting) {
        return posting;
      }
    }
    return null;
  }

  const record = asRecord(value);
  if (Object.keys(record).length === 0) {
    return null;
  }
  if (stringArray(record["@type"]).includes("JobPosting")) {
    return record;
  }
  return findJobPosting(record["@graph"]);
}

function locationNames(value: unknown): string[] {
  return valueArray(value)
    .map(asRecord)
    .flatMap((location) => {
      const address = asRecord(location.address);
      const directName = stringValue(location.name);
      if (directName) {
        return [directName];
      }
      const country = asRecord(address.addressCountry);
      const parts = [
        stringValue(address.addressLocality),
        stringValue(address.addressRegion),
        stringValue(address.addressCountry) || stringValue(country.name),
      ].filter(Boolean);
      return parts.length > 0 ? [parts.join(", ")] : [];
    });
}

function valueArray(value: unknown): unknown[] {
  return value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
}

function stringArray(value: unknown): string[] {
  return valueArray(value).map(stringValue).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseDate(value: unknown): Date | null {
  const text = stringValue(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([\da-f]+);/gi, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
