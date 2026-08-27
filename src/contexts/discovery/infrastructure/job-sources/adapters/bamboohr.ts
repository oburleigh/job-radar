import { z } from "zod";
import { endpoint } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { optionalVendorTextValue, parseVendorResponse } from "./response-schema";
import {
  asRecord,
  type BoardAdapter,
  joinLocation,
  rawJob,
  recordArray,
  requestJson,
  stringValue,
} from "./shared";

const bambooLocationSchema = z.looseObject({
  city: optionalVendorTextValue,
  state: optionalVendorTextValue,
  country: optionalVendorTextValue,
  addressCountry: optionalVendorTextValue,
});
const bambooJobSchema = z.looseObject({
  id: optionalVendorTextValue,
  jobOpeningName: z.string().trim().min(1),
  location: bambooLocationSchema.optional(),
  atsLocation: bambooLocationSchema.optional(),
  locationType: optionalVendorTextValue,
  isRemote: z.boolean().optional(),
  departmentLabel: optionalVendorTextValue,
  employmentStatusLabel: optionalVendorTextValue,
});
const bambooResponseSchema = z.looseObject({ result: z.array(bambooJobSchema) });

export const fetchBambooHr: BoardAdapter = async (board, limit, fetcher) => {
  const payload = parseVendorResponse(
    "BambooHR",
    bambooResponseSchema,
    await requestJson(endpoint("bamboohr", "jobs", { slug: board.slug }), {}, fetcher),
  );

  return recordArray(payload.result)
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
