import type {
  AtsType,
  BoardInput,
  RawJob,
} from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { endpoint, getAtsIntegration, getJobRadarConfig } from "@/infrastructure/config/job-radar";

interface FetchOptions {
  limit?: number;
  fetcher?: typeof fetch;
}

export async function fetchBoardJobs(
  board: BoardInput,
  options: FetchOptions = {},
): Promise<RawJob[]> {
  const limit = options.limit ?? getJobRadarConfig().discovery.boardJobLimit;
  const fetcher = options.fetcher ?? fetch;

  switch (board.atsType) {
    case "ashby":
      return fetchAshby(board, limit, fetcher);
    case "greenhouse":
      return fetchGreenhouse(board, limit, fetcher);
    case "lever":
      return fetchLever(board, limit, fetcher);
    case "bamboohr":
      return fetchBambooHr(board, limit, fetcher);
    case "workable":
      return fetchWorkable(board, limit, fetcher);
    case "smartrecruiters":
      return fetchSmartRecruiters(board, limit, fetcher);
    case "workday":
      return fetchWorkday(board, limit, fetcher);
    case "jobvite":
      return fetchJobvite(board, limit, fetcher);
    case "icims":
    case "linkedin":
      throw new Error(`${board.atsType} does not support direct board sync`);
    default:
      throw new Error(`${board.atsType} does not have a direct board connector`);
  }
}

async function fetchAshby(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const payload = await requestJson(endpoint("ashby", "jobs", { slug: board.slug }), {}, fetcher);

  return recordArray(asRecord(payload).jobs)
    .slice(0, limit)
    .filter((row) => row.isListed !== false && stringValue(row.title))
    .map((row) => {
      const canonicalUrl = stringValue(row.jobUrl);
      const externalId = stringValue(row.id) || lastPathPart(canonicalUrl);
      const secondaryLocations = recordArray(row.secondaryLocations).map((location) =>
        stringValue(location.location),
      );

      return rawJob("ashby", board, row, {
        externalId,
        canonicalUrl: canonicalUrl || `${board.baseUrl}/${externalId}`,
        applyUrl: stringValue(row.applyUrl),
        title: stringValue(row.title),
        locations: [stringValue(row.location), ...secondaryLocations].filter(Boolean),
        description:
          stringValue(row.descriptionPlain) || stripHtml(stringValue(row.descriptionHtml)),
        department: stringValue(row.department),
        employmentType: stringValue(row.employmentType),
        workplaceType: stringValue(row.workplaceType),
        publishedAt: parseDate(row.publishedAt),
      });
    });
}

async function fetchGreenhouse(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const payload = await requestJson(
    endpoint("greenhouse", "jobs", { slug: board.slug }),
    {},
    fetcher,
  );

  return recordArray(asRecord(payload).jobs)
    .slice(0, limit)
    .filter((row) => stringValue(row.title))
    .map((row) => {
      const externalId = stringValue(row.id) || stringValue(row.internal_job_id);
      const location = asRecord(row.location);
      const departments = recordArray(row.departments);

      return rawJob("greenhouse", board, row, {
        externalId,
        canonicalUrl: stringValue(row.absolute_url) || `${board.baseUrl}/jobs/${externalId}`,
        title: stringValue(row.title),
        companyName: stringValue(row.company_name) || board.companyName || board.slug,
        locations: [stringValue(location.name)].filter(Boolean),
        description: stripHtml(stringValue(row.content)),
        department: stringValue(departments[0]?.name),
        publishedAt: parseDate(row.first_published ?? row.updated_at),
      });
    });
}

async function fetchLever(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const payload = await requestJson(
    endpoint("lever", board.config.region === "eu" ? "jobsEu" : "jobs", {
      slug: board.slug,
    }),
    {},
    fetcher,
  );

  return recordArray(payload)
    .slice(0, limit)
    .filter((row) => stringValue(row.text))
    .map((row) => {
      const categories = asRecord(row.categories);
      const allLocations = stringArray(categories.allLocations);
      const listContent = recordArray(row.lists).map((item) => stringValue(item.content));
      const externalId = stringValue(row.id);

      return rawJob("lever", board, row, {
        externalId,
        canonicalUrl: stringValue(row.hostedUrl) || `${board.baseUrl}/${externalId}`,
        applyUrl: stringValue(row.applyUrl),
        title: stringValue(row.text),
        locations:
          allLocations.length > 0
            ? allLocations
            : [stringValue(categories.location)].filter(Boolean),
        description: stripHtml(
          [
            stringValue(row.descriptionPlain) || stringValue(row.description),
            ...listContent,
            stringValue(row.additionalPlain) || stringValue(row.additional),
          ].join("\n"),
        ),
        department: stringValue(categories.department),
        employmentType: stringValue(categories.commitment),
        workplaceType: stringValue(row.workplaceType),
        publishedAt: parseEpochMilliseconds(row.createdAt),
      });
    });
}

async function fetchBambooHr(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const payload = await requestJson(
    endpoint("bamboohr", "jobs", { slug: board.slug }),
    {},
    fetcher,
  );

  return recordArray(asRecord(payload).result)
    .slice(0, limit)
    .filter((row) => stringValue(row.jobOpeningName))
    .map((row) => {
      const externalId = stringValue(row.id);
      const location = asRecord(row.location);
      const atsLocation = asRecord(row.atsLocation);
      const locationType = stringValue(row.locationType);

      return rawJob("bamboohr", board, row, {
        externalId,
        canonicalUrl: `${board.baseUrl}/${externalId}`,
        title: stringValue(row.jobOpeningName),
        locations: [
          joinLocation(
            stringValue(location.city) || stringValue(atsLocation.city),
            stringValue(location.state) || stringValue(atsLocation.state),
            stringValue(atsLocation.country) || stringValue(location.addressCountry),
          ),
        ].filter(Boolean),
        department: stringValue(row.departmentLabel),
        employmentType: stringValue(row.employmentStatusLabel),
        workplaceType:
          row.isRemote === true || locationType === "1"
            ? "remote"
            : locationType === "2"
              ? "hybrid"
              : "",
      });
    });
}

async function fetchWorkable(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const payload = await requestJson(
    endpoint("workable", "jobs", { slug: board.slug }),
    {},
    fetcher,
  );

  return recordArray(asRecord(payload).jobs)
    .slice(0, limit)
    .filter((row) => stringValue(row.title))
    .map((row) => {
      const externalId = stringValue(row.shortcode) || stringValue(row.code);
      const structuredLocations = recordArray(row.locations).map((location) =>
        joinLocation(
          stringValue(location.city),
          stringValue(location.region),
          stringValue(location.country),
        ),
      );

      return rawJob("workable", board, row, {
        externalId,
        canonicalUrl:
          stringValue(row.url) || stringValue(row.shortlink) || `${board.baseUrl}/j/${externalId}`,
        applyUrl: stringValue(row.application_url),
        title: stringValue(row.title),
        locations:
          structuredLocations.length > 0
            ? structuredLocations
            : [
                joinLocation(
                  stringValue(row.city),
                  stringValue(row.state),
                  stringValue(row.country),
                ),
              ].filter(Boolean),
        department: stringValue(row.department),
        employmentType: stringValue(row.employment_type),
        workplaceType: row.telecommuting === true ? "remote" : "",
        publishedAt: parseDate(row.published_on ?? row.created_at),
      });
    });
}

async function fetchSmartRecruiters(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const results: RawJob[] = [];
  let offset = 0;

  while (results.length < limit) {
    const pageSize = getAtsIntegration("smartrecruiters").pageSize ?? limit;
    const pageLimit = Math.min(pageSize, limit - results.length);
    const payload = await requestJson(
      endpoint("smartrecruiters", "jobs", {
        slug: board.slug,
        offset,
        limit: pageLimit,
      }),
      {},
      fetcher,
    );
    const rows = recordArray(asRecord(payload).content);
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const title = stringValue(row.name);
      if (!title) {
        continue;
      }
      const externalId = stringValue(row.id) || stringValue(row.uuid);
      const location = asRecord(row.location);
      const company = asRecord(row.company);
      const department = asRecord(row.department);
      const employment = asRecord(row.typeOfEmployment);

      results.push(
        rawJob("smartrecruiters", board, row, {
          externalId,
          canonicalUrl: `${board.baseUrl.replace(/\/$/, "")}/${externalId}`,
          title,
          companyName: stringValue(company.name) || board.companyName || board.slug,
          locations: [
            joinLocation(
              stringValue(location.city),
              stringValue(location.region),
              stringValue(location.country),
            ),
          ].filter(Boolean),
          department: stringValue(department.label),
          employmentType: stringValue(employment.label),
          workplaceType: location.remote === true ? "remote" : "",
          publishedAt: parseDate(row.releasedDate),
        }),
      );
    }

    offset += rows.length;
    if (rows.length < pageLimit) {
      break;
    }
  }

  return results.slice(0, limit);
}

async function fetchWorkday(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const host = board.config.host || new URL(board.baseUrl).hostname;
  const tenant = board.config.tenant || board.slug;
  const site = board.config.site || "External";
  const jobsEndpoint = endpoint("workday", "jobs", {
    host,
    tenant,
    site,
  });
  const results: RawJob[] = [];
  let offset = 0;

  while (results.length < limit) {
    const pageSize = getAtsIntegration("workday").pageSize ?? limit;
    const pageLimit = Math.min(pageSize, limit - results.length);
    const payload = await requestJson(
      jobsEndpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appliedFacets: {},
          limit: pageLimit,
          offset,
          searchText: "",
        }),
      },
      fetcher,
    );
    const rows = recordArray(asRecord(payload).jobPostings);
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const title = stringValue(row.title);
      if (!title) {
        continue;
      }
      const externalPath = stringValue(row.externalPath);
      const externalId = lastPathPart(externalPath);

      results.push(
        rawJob("workday", board, row, {
          externalId,
          canonicalUrl: `${board.baseUrl.replace(/\/$/, "")}${externalPath}`,
          title,
          companyName: board.companyName || tenant,
          locations: [stringValue(row.locationsText), ...stringArray(row.bulletFields)].filter(
            Boolean,
          ),
          workplaceType: stringValue(row.remoteType),
          publishedAt: parseWorkdayDate(row.postedOn),
        }),
      );
    }

    offset += rows.length;
    if (rows.length < pageLimit) {
      break;
    }
  }

  return results.slice(0, limit);
}

async function fetchJobvite(
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
): Promise<RawJob[]> {
  const html = await requestText(endpoint("jobvite", "jobs", { slug: board.slug }), fetcher);
  const results: RawJob[] = [];
  const sectionPattern =
    /<h3\b[^>]*class=["'][^"']*\bh2\b[^"']*["'][^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|$)/gi;
  const sections = [...html.matchAll(sectionPattern)];
  const searchableSections =
    sections.length > 0
      ? sections.map((section) => ({
          department: stripHtml(section[1] ?? ""),
          html: section[2] ?? "",
        }))
      : [{ department: "", html }];

  for (const section of searchableSections) {
    const jobPattern =
      /<a\b[^>]*class=["'][^"']*\bjv-job-name\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of section.html.matchAll(jobPattern)) {
      const href = match[1] ?? "";
      const content = match[2] ?? "";
      const locationMatch = content.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i);
      const location = stripHtml(locationMatch?.[1] ?? "");
      const title = stripHtml(content.replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, ""));
      const canonicalUrl = new URL(href, board.baseUrl).toString();
      const externalId = lastPathPart(canonicalUrl);
      if (!externalId || !title) {
        continue;
      }
      results.push(
        rawJob(
          "jobvite",
          board,
          {
            source: "jobvite-public-careers-page",
            department: section.department,
            href,
          },
          {
            externalId,
            canonicalUrl,
            applyUrl: canonicalUrl,
            title,
            locations: [location].filter(Boolean),
            description: section.department,
            department: section.department,
            workplaceType: location.toLowerCase().includes("remote") ? "remote" : "",
          },
        ),
      );
      if (results.length >= limit) {
        return results;
      }
    }
  }

  return results;
}

interface RawJobFields {
  externalId: string;
  canonicalUrl: string;
  title: string;
  applyUrl?: string;
  companyName?: string;
  locations?: string[];
  description?: string;
  department?: string;
  employmentType?: string;
  workplaceType?: string;
  publishedAt?: Date | null;
}

function rawJob(
  atsType: AtsType,
  board: BoardInput,
  payload: Record<string, unknown>,
  fields: RawJobFields,
): RawJob {
  return {
    atsType,
    externalId: fields.externalId,
    canonicalUrl: fields.canonicalUrl,
    applyUrl: fields.applyUrl ?? "",
    title: fields.title,
    companyName: fields.companyName ?? (board.companyName || board.slug),
    locations: unique(fields.locations ?? []),
    description: fields.description ?? "",
    department: fields.department ?? "",
    employmentType: fields.employmentType ?? "",
    workplaceType: fields.workplaceType ?? "",
    publishedAt: fields.publishedAt ?? null,
    rawPayload: payload,
  };
}

async function requestJson(
  input: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<unknown> {
  const headers = new Headers(init.headers);
  const config = getJobRadarConfig();
  headers.set("Accept", "application/json");
  headers.set("User-Agent", config.network.userAgent);

  const response = await fetcher(input, {
    ...init,
    headers,
    signal: AbortSignal.timeout(config.network.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`ATS request returned HTTP ${response.status}`);
  }
  return response.json();
}

async function requestText(input: string, fetcher: typeof fetch): Promise<string> {
  const config = getJobRadarConfig();
  const response = await fetcher(input, {
    headers: {
      Accept: "text/html",
      "User-Agent": config.network.userAgent,
    },
    signal: AbortSignal.timeout(config.network.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`ATS request returned HTTP ${response.status}`);
  }
  return response.text();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: unknown): Date | null {
  const text = stringValue(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseEpochMilliseconds(value: unknown): Date | null {
  const timestamp = typeof value === "number" ? value : Number.parseInt(stringValue(value), 10);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseWorkdayDate(value: unknown): Date | null {
  const text = stringValue(value).trim().toLowerCase();
  const now = new Date();
  if (text === "posted today") {
    return now;
  }
  if (text === "posted yesterday") {
    return new Date(now.getTime() - 86_400_000);
  }
  const relative = text.match(/^posted (\d+)(\+)? days? ago$/);
  if (relative?.[1]) {
    return new Date(
      now.getTime() -
        (Number.parseInt(relative[1], 10) + Number(Boolean(relative[2]))) * 86_400_000,
    );
  }
  return parseDate(value);
}

function lastPathPart(urlOrPath: string): string {
  try {
    const path = urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
    return path.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return "";
  }
}

function joinLocation(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
