import type { SearchProfileId } from "@/contexts/discovery/domain/identifiers";

export type SaveSearchProfileResult =
  | { readonly status: "duplicate-name" }
  | { readonly status: "saved"; readonly id: SearchProfileId; readonly created: boolean };
