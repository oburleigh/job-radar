import type { Shortlist } from "@/contexts/recruiter-engagement/domain/shortlist";

export interface ShortlistStore {
  readonly delete: (shortlistId: string) => Promise<void>;
  readonly get: (shortlistId: string) => Promise<Shortlist | undefined>;
  readonly list: () => Promise<readonly Shortlist[]>;
  readonly save: (shortlist: Shortlist) => Promise<void>;
}
