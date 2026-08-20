import { eq } from "drizzle-orm";

import type { AtsIntegrationRegistry } from "@/contexts/discovery/application/ats-integrations/save/port";
import { isBuiltInAtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";
import type { db } from "./database";
import { atsIntegrations, sourceDomains } from "./schema";

type Database = typeof db;

export function createSqliteAtsIntegrationRegistry(database: Database): AtsIntegrationRegistry {
  return {
    isBuiltIn: isBuiltInAtsType,
    exists(atsType) {
      return Boolean(
        database
          .select({ atsType: atsIntegrations.atsType })
          .from(atsIntegrations)
          .where(eq(atsIntegrations.atsType, atsType))
          .get(),
      );
    },
    findPatternConflict(atsType, patterns) {
      const conflict = database
        .select({ owner: sourceDomains.atsType, pattern: sourceDomains.pattern })
        .from(sourceDomains)
        .all()
        .find((source) => patterns.includes(source.pattern) && source.owner !== atsType);
      return conflict ?? null;
    },
    save(command, changedAt) {
      database.transaction((transaction) => {
        transaction
          .insert(atsIntegrations)
          .values({
            atsType: command.atsType,
            label: command.label,
            hostnames: [...command.hostnames],
            hostSuffixes: [...command.hostSuffixes],
            supportsBoardSync: command.supportsBoardSync,
            priority: command.priority,
            pageSize: command.pageSize,
            endpoints: { ...command.endpoints },
            updatedAt: changedAt,
          })
          .onConflictDoUpdate({
            target: atsIntegrations.atsType,
            set: {
              label: command.label,
              hostnames: [...command.hostnames],
              hostSuffixes: [...command.hostSuffixes],
              supportsBoardSync: command.supportsBoardSync,
              priority: command.priority,
              pageSize: command.pageSize,
              endpoints: { ...command.endpoints },
              updatedAt: changedAt,
            },
          })
          .run();

        const currentSources = transaction
          .select()
          .from(sourceDomains)
          .where(eq(sourceDomains.atsType, command.atsType))
          .all();
        for (const source of currentSources) {
          transaction
            .update(sourceDomains)
            .set({ enabled: command.searchPatterns.includes(source.pattern) })
            .where(eq(sourceDomains.id, source.id))
            .run();
        }
        for (const [index, pattern] of command.searchPatterns.entries()) {
          transaction
            .insert(sourceDomains)
            .values({
              atsType: command.atsType,
              pattern,
              enabled: true,
              supportsBoardSync: command.supportsBoardSync,
              priority: command.priority + index,
            })
            .onConflictDoUpdate({
              target: sourceDomains.pattern,
              set: {
                atsType: command.atsType,
                enabled: true,
                supportsBoardSync: command.supportsBoardSync,
                priority: command.priority + index,
              },
            })
            .run();
        }
      });
    },
  };
}
