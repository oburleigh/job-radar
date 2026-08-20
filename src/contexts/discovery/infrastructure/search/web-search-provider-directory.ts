import type { SearchProviderDirectory } from "@/contexts/discovery/application/discovery-runs/ports/search-provider-directory";

import { createSearchProvider } from "./web-search-provider";

export function createWebSearchProviderDirectory(): SearchProviderDirectory {
  return { get: createSearchProvider };
}
