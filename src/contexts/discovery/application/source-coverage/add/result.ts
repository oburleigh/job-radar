export type AddJobSourceResult =
  | { readonly status: "board-added"; readonly atsType: string }
  | {
      readonly status: "existing-source-enabled";
      readonly label: string;
      readonly hostname: string;
    }
  | { readonly status: "built-in-covered"; readonly label: string }
  | { readonly status: "search-source-added"; readonly label: string };
