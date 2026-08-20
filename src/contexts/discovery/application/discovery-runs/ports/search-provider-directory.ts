import type { SearchProvider } from "./search-provider";

export interface SearchProviderDirectory {
  readonly get: (name: string) => SearchProvider;
}
