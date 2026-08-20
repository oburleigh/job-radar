import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";

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

export const fetchGreenhouse: BoardConnector = async (board, limit, fetcher) => {
  const payload = await requestJson(
    endpoint("greenhouse", "jobs", { slug: board.slug }),
    {},
    fetcher,
  );

  return recordArray(asRecord(payload).jobs)
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
