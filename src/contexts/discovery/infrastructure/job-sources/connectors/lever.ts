import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";

import {
  asRecord,
  type BoardConnector,
  parseEpochMilliseconds,
  rawJob,
  recordArray,
  requestJson,
  stringArray,
  stringValue,
  stripHtml,
} from "./shared";

export const fetchLever: BoardConnector = async (board, limit, fetcher) => {
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
};
