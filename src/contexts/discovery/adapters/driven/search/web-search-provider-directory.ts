import type { SearchProviderDirectory } from "@/contexts/discovery/hexagon/application/search-provider-directory";

import { createSearchProvider } from "./web-search-provider";

export function createWebSearchProviderDirectory(): SearchProviderDirectory {
  return { get: createSearchProvider };
}
