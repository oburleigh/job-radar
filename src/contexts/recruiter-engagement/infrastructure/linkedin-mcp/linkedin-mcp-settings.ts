import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { z } from "zod";

import { recruiterAdapterSettings } from "@/contexts/recruiter-engagement/infrastructure/sqlite/schema";
import { parseLoopbackHttpUrl } from "@/platform/http/loopback-http-url";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

export type LinkedInMcpSettings = {
  readonly endpoint: string | null;
};

const adapterId = "linkedin-mcp";
const defaultSettings = { endpoint: null } as const satisfies LinkedInMcpSettings;
const settingsSchema = z
  .object({
    endpoint: z
      .string()
      .refine((value) => parseLoopbackHttpUrl(value) !== null, {
        message: "must be a loopback HTTP URL",
      })
      .nullable(),
  })
  .strict();

export function bootstrapLinkedInMcpSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  now = new Date(),
): void {
  database
    .insert(recruiterAdapterSettings)
    .values({ adapterId, configuration: defaultSettings, updatedAt: now })
    .onConflictDoNothing()
    .run();
}

export function getLinkedInMcpSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
): LinkedInMcpSettings {
  const configuration = database
    .select({ configuration: recruiterAdapterSettings.configuration })
    .from(recruiterAdapterSettings)
    .where(eq(recruiterAdapterSettings.adapterId, adapterId))
    .get()?.configuration;
  if (configuration === undefined) {
    throw new Error("Missing LinkedIn MCP settings in SQLite. Run pnpm db:setup.");
  }
  const parsed = settingsSchema.safeParse(configuration);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `Invalid LinkedIn MCP settings: ${issue?.message ?? "configuration is invalid"}.`,
    );
  }
  return parsed.data;
}

export function replaceLinkedInMcpSettings<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  settings: LinkedInMcpSettings,
  changedAt: Date,
): void {
  const configuration = settingsSchema.parse(settings);
  database
    .update(recruiterAdapterSettings)
    .set({ configuration, updatedAt: changedAt })
    .where(eq(recruiterAdapterSettings.adapterId, adapterId))
    .run();
}
