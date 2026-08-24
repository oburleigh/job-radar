import { z } from "zod";
import {
  type AnnualSalaryRange,
  createAnnualSalaryRange,
} from "@/contexts/discovery/domain/annual-salary";
import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { parseVendorRecords, parseVendorResponse } from "./response-schema";
import {
  asRecord,
  type BoardConnector,
  lastPathPart,
  parseDate,
  rawJob,
  recordArray,
  requestJson,
  stringValue,
  stripHtml,
} from "./shared";

const ashbyJobSchema = z
  .looseObject({
    title: z.string().trim().min(1),
  })
  .refine((row) => [row.id, row.jobUrl].some((value) => stringValue(value)), {
    message: "missing a usable job identifier or URL",
  });
const ashbyResponseSchema = z.looseObject({ jobs: z.array(z.unknown()) });

export const fetchAshby: BoardConnector = async (board, limit, fetcher, reportRejected) => {
  const payload = parseVendorResponse(
    "Ashby",
    ashbyResponseSchema,
    await requestJson(endpoint("ashby", "jobs", { slug: board.slug }), {}, fetcher),
  );

  return parseVendorRecords({
    vendor: "Ashby",
    board: board.canonicalKey,
    records: payload.jobs.slice(0, limit),
    schema: ashbyJobSchema,
    identityKeys: ["id", "jobUrl", "applyUrl"],
    ...(reportRejected ? { reportRejected } : {}),
  })
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
        publishedSalary: ashbyAnnualSalary(row),
      });
    });
};

function ashbyAnnualSalary(row: Record<string, unknown>): AnnualSalaryRange | null {
  const compensation = asRecord(row.compensation);
  const components = recordArray(compensation.summaryComponents).filter(
    (component) =>
      stringValue(component.compensationType).toLowerCase() === "salary" &&
      stringValue(component.interval).toLowerCase().includes("year"),
  );
  const currency = components.map((component) => stringValue(component.currencyCode)).find(Boolean);
  if (!currency) {
    return null;
  }
  const comparable = components.filter(
    (component) => stringValue(component.currencyCode).toUpperCase() === currency.toUpperCase(),
  );
  const minimums = comparable.map((component) => numberValue(component.minValue)).filter(isNumber);
  const maximums = comparable.map((component) => numberValue(component.maxValue)).filter(isNumber);
  return createAnnualSalaryRange(
    currency,
    minimums.length > 0 ? Math.min(...minimums) : null,
    maximums.length > 0 ? Math.max(...maximums) : null,
  );
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNumber(value: number | null): value is number {
  return value !== null;
}
