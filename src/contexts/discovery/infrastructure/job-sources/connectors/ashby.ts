import { z } from "zod";
import {
  type AnnualSalaryRange,
  createAnnualSalaryRange,
} from "@/contexts/discovery/domain/annual-salary";
import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { optionalVendorTextValue, parseVendorResponse } from "./response-schema";
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

const compensationComponentSchema = z.looseObject({
  compensationType: optionalVendorTextValue,
  interval: optionalVendorTextValue,
  currencyCode: optionalVendorTextValue,
  minValue: z.number().finite().nullable().optional(),
  maxValue: z.number().finite().nullable().optional(),
});
const ashbyJobSchema = z.looseObject({
  id: optionalVendorTextValue,
  title: z.string().trim().min(1),
  jobUrl: optionalVendorTextValue,
  applyUrl: optionalVendorTextValue,
  isListed: z.boolean().optional(),
  location: optionalVendorTextValue,
  secondaryLocations: z.array(z.looseObject({ location: optionalVendorTextValue })).optional(),
  descriptionPlain: optionalVendorTextValue,
  descriptionHtml: optionalVendorTextValue,
  department: optionalVendorTextValue,
  employmentType: optionalVendorTextValue,
  workplaceType: optionalVendorTextValue,
  publishedAt: z.unknown().optional(),
  compensation: z
    .looseObject({ summaryComponents: z.array(compensationComponentSchema).optional() })
    .optional(),
});
const ashbyResponseSchema = z.looseObject({ jobs: z.array(ashbyJobSchema) });

export const fetchAshby: BoardConnector = async (board, limit, fetcher) => {
  const payload = parseVendorResponse(
    "Ashby",
    ashbyResponseSchema,
    await requestJson(endpoint("ashby", "jobs", { slug: board.slug }), {}, fetcher),
  );

  return recordArray(payload.jobs)
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
