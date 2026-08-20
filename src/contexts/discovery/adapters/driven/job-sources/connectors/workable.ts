import { endpoint } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";

import {
  asRecord,
  type BoardConnector,
  joinLocation,
  parseDate,
  rawJob,
  recordArray,
  requestJson,
  stringValue,
} from "./shared";

export const fetchWorkable: BoardConnector = async (board, limit, fetcher) => {
  const payload = await requestJson(
    endpoint("workable", "jobs", { slug: board.slug }),
    {},
    fetcher,
  );

  return recordArray(asRecord(payload).jobs)
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
