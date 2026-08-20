import { endpoint } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";

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

export const fetchAshby: BoardConnector = async (board, limit, fetcher) => {
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
};
