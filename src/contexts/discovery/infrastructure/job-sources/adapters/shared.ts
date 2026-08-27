import type { AnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { extractAnnualSalaryFromText } from "@/contexts/discovery/infrastructure/job-sources/annual-salary-parser";
import type {
  AtsType,
  BoardInput,
  RawJob,
} from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import type { ReportRejectedVendorRecord } from "./response-schema";

export type BoardAdapter = (
  board: BoardInput,
  limit: number,
  fetcher: typeof fetch,
  reportRejected?: ReportRejectedVendorRecord,
) => Promise<RawJob[]>;

export type AtsPostingLookup =
  | { readonly status: "verified"; readonly job: RawJob }
  | {
      readonly status: "closed" | "not_found" | "protected" | "transient_failure";
      readonly reason: string;
      readonly checkedUrl: string;
    };

export type PostingLookupAdapter = (
  board: BoardInput,
  externalId: string,
  fetcher: typeof fetch,
) => Promise<AtsPostingLookup>;

export async function lookupPostingInBoard(
  board: BoardInput,
  externalId: string,
  checkedUrl: string,
  adapter: BoardAdapter,
  fetcher: typeof fetch,
): Promise<AtsPostingLookup> {
  let boardJobs: RawJob[];
  try {
    boardJobs = await adapter(board, Number.MAX_SAFE_INTEGER, fetcher);
  } catch (error) {
    if (error instanceof AtsRequestError) {
      if (error.status === 404 || error.status === 410) {
        return { status: "not_found", reason: `http-${error.status}`, checkedUrl };
      }
      if (error.status === 401 || error.status === 403 || error.status === 429) {
        return { status: "protected", reason: `http-${error.status}`, checkedUrl };
      }
      return { status: "transient_failure", reason: `http-${error.status}`, checkedUrl };
    }
    return { status: "transient_failure", reason: "request-failed", checkedUrl };
  }
  const job = boardJobs.find(
    (candidate) =>
      candidate.externalId === externalId || lastPathPart(candidate.canonicalUrl) === externalId,
  );
  return job
    ? { status: "verified", job }
    : { status: "not_found", reason: "posting-absent", checkedUrl };
}

type RawJobFields = {
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly applyUrl?: string;
  readonly companyName?: string;
  readonly locations?: string[];
  readonly description?: string;
  readonly department?: string;
  readonly employmentType?: string;
  readonly workplaceType?: string;
  readonly publishedAt?: Date | null;
  readonly publishedSalary?: AnnualSalaryRange | null;
};

export function rawJob(
  atsType: AtsType,
  board: BoardInput,
  payload: Record<string, unknown>,
  fields: RawJobFields,
): RawJob {
  const description = fields.description ?? "";
  return {
    atsType,
    externalId: fields.externalId,
    canonicalUrl: fields.canonicalUrl,
    applyUrl: fields.applyUrl ?? "",
    title: fields.title,
    companyName: fields.companyName ?? (board.companyName || board.slug),
    locations: unique(fields.locations ?? []),
    description,
    department: fields.department ?? "",
    employmentType: fields.employmentType ?? "",
    workplaceType: fields.workplaceType ?? "",
    publishedAt: fields.publishedAt ?? null,
    publishedSalary:
      fields.publishedSalary === undefined
        ? extractAnnualSalaryFromText(description)
        : fields.publishedSalary,
    evidence: "structured",
    rawPayload: payload,
  };
}

export async function requestJson(
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
    throw new AtsRequestError(response.status);
  }
  return response.json();
}

class AtsRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`ATS request returned HTTP ${status}`);
    this.status = status;
  }
}

export async function requestPostingJson(
  input: string,
  fetcher: typeof fetch,
): Promise<
  | { readonly status: "ok"; readonly payload: unknown }
  | Exclude<AtsPostingLookup, { status: "verified" | "closed" }>
> {
  const config = getJobRadarConfig();
  let response: Response;
  try {
    response = await fetcher(input, {
      headers: {
        Accept: "application/json",
        "User-Agent": config.network.userAgent,
      },
      signal: AbortSignal.timeout(config.network.timeoutMs),
    });
  } catch {
    return { status: "transient_failure", reason: "request-failed", checkedUrl: input };
  }
  if (response.status === 404 || response.status === 410) {
    return { status: "not_found", reason: `http-${response.status}`, checkedUrl: input };
  }
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    return { status: "protected", reason: `http-${response.status}`, checkedUrl: input };
  }
  if (!response.ok) {
    return { status: "transient_failure", reason: `http-${response.status}`, checkedUrl: input };
  }
  try {
    return { status: "ok", payload: await response.json() };
  } catch {
    return { status: "transient_failure", reason: "invalid-response", checkedUrl: input };
  }
}

export async function requestText(input: string, fetcher: typeof fetch): Promise<string> {
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

export function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

export function stringValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [];
}

export function stripHtml(value: string): string {
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

export function parseDate(value: unknown): Date | null {
  const text = stringValue(value);
  if (!text) {
    return null;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseEpochMilliseconds(value: unknown): Date | null {
  const timestamp = typeof value === "number" ? value : Number.parseInt(stringValue(value), 10);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseWorkdayDate(value: unknown): Date | null {
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

export function lastPathPart(urlOrPath: string): string {
  try {
    const path = urlOrPath.startsWith("http") ? new URL(urlOrPath).pathname : urlOrPath;
    return path.split("/").filter(Boolean).at(-1) ?? "";
  } catch {
    return "";
  }
}

export function joinLocation(...parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
