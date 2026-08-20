export type SaveSearchProfileResult =
  | { readonly status: "duplicate-name" }
  | { readonly status: "saved"; readonly id: number; readonly created: boolean };
