import { endpoint } from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";

import {
  asRecord,
  type BoardConnector,
  joinLocation,
  rawJob,
  recordArray,
  requestJson,
  stringValue,
} from "./shared";

export const fetchBambooHr: BoardConnector = async (board, limit, fetcher) => {
  const payload = await requestJson(
    endpoint("bamboohr", "jobs", { slug: board.slug }),
    {},
    fetcher,
  );

  return recordArray(asRecord(payload).result)
    .slice(0, limit)
    .filter((row) => stringValue(row.jobOpeningName))
    .map((row) => {
      const externalId = stringValue(row.id);
      const location = asRecord(row.location);
      const atsLocation = asRecord(row.atsLocation);
      const locationType = stringValue(row.locationType);

      return rawJob("bamboohr", board, row, {
        externalId,
        canonicalUrl: `${board.baseUrl}/${externalId}`,
        title: stringValue(row.jobOpeningName),
        locations: [
          joinLocation(
            stringValue(location.city) || stringValue(atsLocation.city),
            stringValue(location.state) || stringValue(atsLocation.state),
            stringValue(atsLocation.country) || stringValue(location.addressCountry),
          ),
        ].filter(Boolean),
        department: stringValue(row.departmentLabel),
        employmentType: stringValue(row.employmentStatusLabel),
        workplaceType:
          row.isRemote === true || locationType === "1"
            ? "remote"
            : locationType === "2"
              ? "hybrid"
              : "",
      });
    });
};
