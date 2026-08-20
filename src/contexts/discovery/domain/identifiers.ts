declare const searchProfileIdBrand: unique symbol;
declare const jobListingIdBrand: unique symbol;

export type SearchProfileId = number & { readonly [searchProfileIdBrand]: "SearchProfileId" };
export type JobListingId = number & { readonly [jobListingIdBrand]: "JobListingId" };

export function searchProfileIdFrom(value: number): SearchProfileId | null {
  return isPositiveIdentifier(value) ? (value as SearchProfileId) : null;
}

export function jobListingIdFrom(value: number): JobListingId | null {
  return isPositiveIdentifier(value) ? (value as JobListingId) : null;
}

function isPositiveIdentifier(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}
