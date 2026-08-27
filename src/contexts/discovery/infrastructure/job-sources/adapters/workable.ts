import { z } from "zod";
import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { parseVendorRecords, parseVendorResponse } from "./response-schema";
import {
  type BoardAdapter,
  joinLocation,
  lookupPostingInBoard,
  type PostingLookupAdapter,
  parseDate,
  rawJob,
  recordArray,
  requestJson,
  stringValue,
} from "./shared";

const workableJobSchema = z
  .looseObject({
    title: z.string().trim().min(1),
  })
  .refine(
    (row) => [row.shortcode, row.code, row.url, row.shortlink].some((value) => stringValue(value)),
    { message: "missing a usable job identifier or URL" },
  );
const workableResponseSchema = z.looseObject({ jobs: z.array(z.unknown()) });

export const fetchWorkable: BoardAdapter = async (board, limit, fetcher, reportRejected) => {
  const payload = parseVendorResponse(
    "Workable",
    workableResponseSchema,
    await requestJson(endpoint("workable", "jobs", { slug: board.slug }), {}, fetcher),
  );

  return parseVendorRecords({
    vendor: "Workable",
    board: board.canonicalKey,
    records: payload.jobs.slice(0, limit),
    schema: workableJobSchema,
    identityKeys: ["shortcode", "code", "url", "shortlink"],
    ...(reportRejected ? { reportRejected } : {}),
  })
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

export const lookupWorkablePosting: PostingLookupAdapter = (board, externalId, fetcher) =>
  lookupPostingInBoard(
    board,
    externalId,
    endpoint("workable", "jobs", { slug: board.slug }),
    fetchWorkable,
    fetcher,
  );
