import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { ClassifiedUrl } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import {
  canonicalizeUrl,
  classifyUrlWithConfig,
  makeDedupeKey,
} from "@/contexts/discovery/infrastructure/job-sources/url-classification";

export { canonicalizeUrl, makeDedupeKey };

export function classifyUrl(value: string): ClassifiedUrl | null {
  return classifyUrlWithConfig(value, getJobRadarConfig().ats);
}
