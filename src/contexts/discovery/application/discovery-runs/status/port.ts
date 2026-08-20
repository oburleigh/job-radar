import type { DiscoveryRunStatusQuery } from "./query";
import type { DiscoveryRunStatusesDto } from "./result";

export interface DiscoveryRunStatusReader {
  read(query: DiscoveryRunStatusQuery): DiscoveryRunStatusesDto;
}
