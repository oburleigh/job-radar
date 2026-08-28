export type LocationOption = {
  readonly countryCode: string;
  readonly detail: string;
  readonly id: string;
  readonly kind: "country" | "administrative-area" | "city";
  readonly label: string;
  readonly searchTerms: readonly string[];
};
