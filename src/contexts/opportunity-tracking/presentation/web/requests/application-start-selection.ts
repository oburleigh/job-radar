import { z } from "zod";

const selectionSchema = z
  .object({
    searchProfileId: z.coerce.number().int().safe().positive(),
    jobListingId: z.coerce.number().int().safe().positive(),
  })
  .strict();

export type ApplicationStartSelectionResult =
  | {
      readonly ok: true;
      readonly searchProfileId: number;
      readonly jobListingId: number;
    }
  | { readonly ok: false };

export function parseApplicationStartSelection(url: URL): ApplicationStartSelectionResult {
  const parsed = selectionSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  return parsed.success ? { ok: true, ...parsed.data } : { ok: false };
}
