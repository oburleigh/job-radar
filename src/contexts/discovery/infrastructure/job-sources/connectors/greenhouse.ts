import { z } from "zod";
import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { optionalVendorTextValue, parseVendorResponse } from "./response-schema";
import {
  asRecord,
  type BoardConnector,
  parseDate,
  rawJob,
  recordArray,
  requestJson,
  stringValue,
  stripHtml,
} from "./shared";

const greenhouseJobSchema = z.looseObject({
  id: optionalVendorTextValue,
  internal_job_id: optionalVendorTextValue,
  title: z.string().trim().min(1),
  company_name: optionalVendorTextValue,
  absolute_url: optionalVendorTextValue,
  location: z.looseObject({ name: optionalVendorTextValue }).optional(),
  content: optionalVendorTextValue,
  departments: z.array(z.looseObject({ name: optionalVendorTextValue })).optional(),
  first_published: z.unknown().optional(),
  updated_at: z.unknown().optional(),
});
const greenhouseResponseSchema = z.looseObject({ jobs: z.array(greenhouseJobSchema) });

export const fetchGreenhouse: BoardConnector = async (board, limit, fetcher) => {
  const payload = parseVendorResponse(
    "Greenhouse",
    greenhouseResponseSchema,
    await requestJson(endpoint("greenhouse", "jobs", { slug: board.slug }), {}, fetcher),
  );

  return recordArray(payload.jobs)
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
};
