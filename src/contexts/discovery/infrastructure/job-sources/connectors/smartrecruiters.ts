import {
  endpoint,
  getAtsIntegration,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";

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

export const fetchSmartRecruiters: BoardConnector = async (board, limit, fetcher) => {
  const results = [];
  let offset = 0;

  while (results.length < limit) {
    const pageSize = getAtsIntegration("smartrecruiters").pageSize ?? limit;
    const pageLimit = Math.min(pageSize, limit - results.length);
    const payload = await requestJson(
      endpoint("smartrecruiters", "jobs", {
        slug: board.slug,
        offset,
        limit: pageLimit,
      }),
      {},
      fetcher,
    );
    const rows = recordArray(asRecord(payload).content);
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      const title = stringValue(row.name);
      if (!title) {
        continue;
      }
      const externalId = stringValue(row.id) || stringValue(row.uuid);
      const location = asRecord(row.location);
      const company = asRecord(row.company);
      const department = asRecord(row.department);
      const employment = asRecord(row.typeOfEmployment);

      results.push(
        rawJob("smartrecruiters", board, row, {
          externalId,
          canonicalUrl: `${board.baseUrl.replace(/\/$/, "")}/${externalId}`,
          title,
          companyName: stringValue(company.name) || board.companyName || board.slug,
          locations: [
            joinLocation(
              stringValue(location.city),
              stringValue(location.region),
              stringValue(location.country),
            ),
          ].filter(Boolean),
          department: stringValue(department.label),
          employmentType: stringValue(employment.label),
          workplaceType: location.remote === true ? "remote" : "",
          publishedAt: parseDate(row.releasedDate),
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
