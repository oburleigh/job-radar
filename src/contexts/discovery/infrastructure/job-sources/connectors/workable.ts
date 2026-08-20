import { z } from "zod";
import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { optionalVendorTextValue, parseVendorResponse } from "./response-schema";
import {
  type BoardConnector,
  joinLocation,
  parseDate,
  rawJob,
  recordArray,
  requestJson,
  stringValue,
} from "./shared";

const workableLocationSchema = z.looseObject({
  city: optionalVendorTextValue,
  region: optionalVendorTextValue,
  country: optionalVendorTextValue,
});
const workableJobSchema = z.looseObject({
  shortcode: optionalVendorTextValue,
  code: optionalVendorTextValue,
  title: z.string().trim().min(1),
  url: optionalVendorTextValue,
  shortlink: optionalVendorTextValue,
  application_url: optionalVendorTextValue,
  locations: z.array(workableLocationSchema).optional(),
  city: optionalVendorTextValue,
  state: optionalVendorTextValue,
  country: optionalVendorTextValue,
  department: optionalVendorTextValue,
  employment_type: optionalVendorTextValue,
  telecommuting: z.boolean().optional(),
  published_on: z.unknown().optional(),
  created_at: z.unknown().optional(),
});
const workableResponseSchema = z.looseObject({ jobs: z.array(workableJobSchema) });

export const fetchWorkable: BoardConnector = async (board, limit, fetcher) => {
  const payload = parseVendorResponse(
    "Workable",
    workableResponseSchema,
    await requestJson(endpoint("workable", "jobs", { slug: board.slug }), {}, fetcher),
  );

  return recordArray(payload.jobs)
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
};
