export type DeleteSearchProfileResult =
  | { readonly status: "not-found" }
  | { readonly status: "deleted"; readonly nextProfileId: number | null };
