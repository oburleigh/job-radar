import { eq } from "drizzle-orm";

import type { JobSourceRegistrar } from "@/contexts/discovery/application/source-coverage/add/port";
import {
  getAtsIntegration,
  getJobRadarConfig,
  supportsBoardSync,
} from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import type { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  atsIntegrations,
  companyBoards,
  sourceDomains,
} from "@/contexts/discovery/infrastructure/sqlite/schema";
import { isBuiltInAtsType } from "./ats-integration";
import { suggestSearchIntegration } from "./custom-integration";
import { classifyUrl } from "./urls";

type Database = typeof db;

export function createJobSourceRegistrar(database: Database): JobSourceRegistrar {
  return {
    register(command, discoveredAt) {
      const classified = classifyUrl(command.url);
      if (classified?.board && supportsBoardSync(classified.board.atsType)) {
        const identity = classified.board;
        database
          .insert(companyBoards)
          .values({
            atsType: identity.atsType,
            canonicalKey: identity.canonicalKey,
            companyName: command.companyName,
            slug: identity.slug,
            baseUrl: identity.baseUrl,
            config: identity.config,
            enabled: true,
            discoveredAt,
          })
          .onConflictDoUpdate({
            target: companyBoards.canonicalKey,
            set: {
              companyName: command.companyName,
              baseUrl: identity.baseUrl,
              config: identity.config,
              enabled: true,
            },
          })
          .run();
        return { status: "board-added", atsType: identity.atsType };
      }

      const hostname = new URL(command.url).hostname.replace(/^www\./, "").toLowerCase();
      const existingSource = database
        .select()
        .from(sourceDomains)
        .where(eq(sourceDomains.pattern, hostname))
        .get();
      if (existingSource) {
        database
          .update(sourceDomains)
          .set({ enabled: true })
          .where(eq(sourceDomains.id, existingSource.id))
          .run();
        return {
          status: "existing-source-enabled",
          label: getAtsIntegration(existingSource.atsType).label,
          hostname,
        };
      }
      if (classified && !classified.board && isBuiltInAtsType(classified.atsType)) {
        database
          .update(sourceDomains)
          .set({ enabled: true })
          .where(eq(sourceDomains.atsType, classified.atsType))
          .run();
        return {
          status: "built-in-covered",
          label: getAtsIntegration(classified.atsType).label,
        };
      }

      const existingIds = database
        .select({ atsType: atsIntegrations.atsType })
        .from(atsIntegrations)
        .all()
        .map((integration) => integration.atsType);
      const suggestion = suggestSearchIntegration(command.url, existingIds);
      const atsType = classified?.atsType ?? suggestion.atsType;
      const existingIntegration = classified ? getAtsIntegration(classified.atsType) : null;
      const priority =
        existingIntegration?.priority ?? getJobRadarConfig().integrationPolicy.customPriority;

      database.transaction((transaction) => {
        if (!classified) {
          transaction
            .insert(atsIntegrations)
            .values({
              atsType,
              label: suggestion.label,
              hostnames: [hostname],
              hostSuffixes: [],
              supportsBoardSync: false,
              priority,
              pageSize: null,
              endpoints: {},
              updatedAt: discoveredAt,
            })
            .run();
        }
        transaction
          .insert(sourceDomains)
          .values({
            atsType,
            pattern: hostname,
            enabled: true,
            supportsBoardSync: false,
            priority,
          })
          .onConflictDoUpdate({
            target: sourceDomains.pattern,
            set: { atsType, enabled: true, supportsBoardSync: false, priority },
          })
          .run();
      });

      return {
        status: "search-source-added",
        label: classified ? getAtsIntegration(atsType).label : suggestion.label,
      };
    },
  };
}
