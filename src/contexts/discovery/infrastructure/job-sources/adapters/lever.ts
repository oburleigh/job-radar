import { z } from "zod";
import {
  endpoint,
  optionalEndpoint,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { optionalVendorTextValue, parseVendorResponse } from "./response-schema";
import {
  asRecord,
  type BoardAdapter,
  lookupPostingInBoard,
  type PostingLookupAdapter,
  parseEpochMilliseconds,
  rawJob,
  recordArray,
  requestJson,
  requestPostingJson,
  stringArray,
  stringValue,
  stripHtml,
} from "./shared";

const leverJobSchema = z.looseObject({
  id: optionalVendorTextValue,
  text: z.string().trim().min(1),
  hostedUrl: optionalVendorTextValue,
  applyUrl: optionalVendorTextValue,
  categories: z
    .looseObject({
      allLocations: z.array(optionalVendorTextValue).optional(),
      location: optionalVendorTextValue,
      department: optionalVendorTextValue,
      commitment: optionalVendorTextValue,
    })
    .optional(),
  lists: z.array(z.looseObject({ content: optionalVendorTextValue })).optional(),
  descriptionPlain: optionalVendorTextValue,
  description: optionalVendorTextValue,
  additionalPlain: optionalVendorTextValue,
  additional: optionalVendorTextValue,
  workplaceType: optionalVendorTextValue,
  createdAt: z.unknown().optional(),
});
const leverResponseSchema = z.array(leverJobSchema);

export const fetchLever: BoardAdapter = async (board, limit, fetcher) => {
  const payload = parseVendorResponse(
    "Lever",
    leverResponseSchema,
    await requestJson(
      endpoint("lever", board.config.region === "eu" ? "jobsEu" : "jobs", {
        slug: board.slug,
      }),
      {},
      fetcher,
    ),
  );

  return recordArray(payload)
    .slice(0, limit)
    .filter((row) => stringValue(row.text))
    .map((row) => leverJob(board, row));
};

export const lookupLeverPosting: PostingLookupAdapter = async (board, externalId, fetcher) => {
  const endpointName = board.config.region === "eu" ? "postingEu" : "posting";
  const checkedUrl = optionalEndpoint("lever", endpointName, { slug: board.slug, externalId });
  if (!checkedUrl) {
    const jobsEndpointName = board.config.region === "eu" ? "jobsEu" : "jobs";
    return lookupPostingInBoard(
      board,
      externalId,
      endpoint("lever", jobsEndpointName, { slug: board.slug }),
      fetchLever,
      fetcher,
    );
  }
  const response = await requestPostingJson(checkedUrl, fetcher);
  if (response.status !== "ok") {
    return response;
  }
  try {
    const payload = parseVendorResponse("Lever", leverJobSchema, response.payload);
    return { status: "verified", job: leverJob(board, asRecord(payload)) };
  } catch {
    return { status: "transient_failure", reason: "invalid-response", checkedUrl };
  }
};

function leverJob(board: Parameters<BoardAdapter>[0], row: Record<string, unknown>) {
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
      allLocations.length > 0 ? allLocations : [stringValue(categories.location)].filter(Boolean),
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
}
