import {
  endpoint,
  getJobRadarConfig,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { RawJob } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

export type LinkedInLookup =
  | { status: "verified"; job: RawJob }
  | { status: "closed" | "not_found" | "unavailable" };

export async function fetchLinkedInJob(
  externalId: string,
  canonicalUrl: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<LinkedInLookup> {
  if (!externalId) {
    return { status: "unavailable" };
  }

  const config = getJobRadarConfig();
  const response = await fetcher(endpoint("linkedin", "job", { externalId }), {
    headers: {
      Accept: "text/html",
      "User-Agent": config.network.userAgent,
    },
    signal: AbortSignal.timeout(config.network.timeoutMs),
  });
  if (response.status === 404 || response.status === 410) {
    return { status: "not_found" };
  }
  if (!response.ok) {
    return { status: "unavailable" };
  }

  const html = await response.text();
  if (isClosedListing(html, config.discovery.closedListingMarkers)) {
    return { status: "closed" };
  }
  const title = extractClassContent(html, "top-card-layout__title");
  const companyName = extractClassContent(html, "topcard__org-name-link");
  const location = extractClassContent(html, "topcard__flavor--bullet", "span");
  const postedText = extractClassContent(html, "posted-time-ago__text", "span");
  if (!title || !companyName || !location) {
    return { status: "unavailable" };
  }

  return {
    status: "verified",
    job: {
      atsType: "linkedin",
      externalId,
      canonicalUrl,
      applyUrl: canonicalUrl,
      title,
      companyName,
      locations: [location],
      description: extractClassContent(html, "show-more-less-html__markup", "div"),
      department: "",
      employmentType: "",
      workplaceType: location.toLowerCase().includes("remote") ? "remote" : "",
      publishedAt: parseRelativeDate(postedText, now),
      rawPayload: {
        source: "linkedin-public-job",
        postedText,
        verifiedAt: now.toISOString(),
      },
    },
  };
}

function isClosedListing(html: string, closedListingMarkers: readonly string[]): boolean {
  const normalized = stripHtml(html).toLowerCase();
  return (
    html.includes("closed-job__flavor--closed") ||
    closedListingMarkers.some((marker) => normalized.includes(marker.toLowerCase()))
  );
}

function extractClassContent(html: string, className: string, tag = "[a-z][\\w-]*"): string {
  const escapedClassName = escapeRegExp(className);
  const match = html.match(
    new RegExp(
      `<(${tag})[^>]*class=["'][^"']*\\b${escapedClassName}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
      "i",
    ),
  );
  return stripHtml(match?.[2] ?? "");
}

function parseRelativeDate(text: string, now: Date): Date | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/^reposted\s+/, "");
  if (!normalized) {
    return null;
  }
  if (normalized === "today" || normalized.includes("minute ago")) {
    return now;
  }

  const relative = normalized.match(/^(\d+)\+?\s+(minute|hour|day|week|month|year)s?\s+ago$/);
  if (!relative?.[1] || !relative[2]) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const amount = Number.parseInt(relative[1], 10);
  const multiplier =
    relative[2] === "minute"
      ? 60_000
      : relative[2] === "hour"
        ? 3_600_000
        : relative[2] === "day"
          ? 86_400_000
          : relative[2] === "week"
            ? 7 * 86_400_000
            : relative[2] === "month"
              ? 31 * 86_400_000
              : 365 * 86_400_000;
  const extraDay = normalized.includes("+") ? 86_400_000 : 0;
  return new Date(now.getTime() - amount * multiplier - extraDay);
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
