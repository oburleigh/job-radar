import { z } from "zod";
import {
  endpoint,
  getAtsIntegration,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { RawJob } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import { optionalVendorTextValue, parseVendorResponse } from "./response-schema";
import {
  type BoardAdapter,
  lastPathPart,
  parseWorkdayDate,
  rawJob,
  recordArray,
  requestJson,
  stringArray,
  stringValue,
} from "./shared";

const workdayJobSchema = z.looseObject({
  title: z.string().trim().min(1),
  externalPath: z.string().trim().min(1),
  locationsText: optionalVendorTextValue,
  bulletFields: z.array(optionalVendorTextValue).optional(),
  remoteType: optionalVendorTextValue,
  postedOn: z.unknown().optional(),
});
const workdayResponseSchema = z.looseObject({ jobPostings: z.array(workdayJobSchema) });

export const fetchWorkday: BoardAdapter = async (board, limit, fetcher) => {
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
    const payload = parseVendorResponse(
      "Workday",
      workdayResponseSchema,
      await requestJson(
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
      ),
    );
    const rows = recordArray(payload.jobPostings);
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
};
