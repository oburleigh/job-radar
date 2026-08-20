"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  getAtsIntegration,
  getJobRadarConfig,
  supportsBoardSync,
} from "@/contexts/discovery/adapters/driven/configuration/job-radar-config";
import { isBuiltInAtsType } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { suggestSearchIntegration } from "@/contexts/discovery/adapters/driven/job-sources/custom-integration";
import { classifyUrl } from "@/contexts/discovery/adapters/driven/job-sources/urls";
import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import {
  atsIntegrations,
  companyBoards,
  sourceDomains,
} from "@/contexts/discovery/adapters/driven/sqlite/schema";
import { syncEnabledBoards } from "@/contexts/discovery/adapters/driven/sqlite/sync-boards";

import type { ActionState } from "./action-state";
import { assertLocalRequest } from "./assert-local-request";

const boardSchema = z.object({
  url: z.url(),
  companyName: z.string().trim().max(255),
});

export async function toggleSourceAction(id: number, enabled: boolean): Promise<ActionState> {
  await assertLocalRequest();
  const parsed = z.number().int().positive().safeParse(id);
  if (!parsed.success) {
    return { ok: false, message: "Invalid source." };
  }
  db.update(sourceDomains).set({ enabled }).where(eq(sourceDomains.id, parsed.data)).run();
  revalidatePath("/");
  revalidatePath("/sources");
  return { ok: true, message: enabled ? "Source enabled." : "Source paused." };
}

export async function toggleBoardAction(id: number, enabled: boolean): Promise<ActionState> {
  await assertLocalRequest();
  const parsed = z.number().int().positive().safeParse(id);
  if (!parsed.success) {
    return { ok: false, message: "Invalid board." };
  }
  db.update(companyBoards).set({ enabled }).where(eq(companyBoards.id, parsed.data)).run();
  revalidatePath("/");
  revalidatePath("/sources");
  return { ok: true, message: enabled ? "Board enabled." : "Board paused." };
}

export async function addBoardAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertLocalRequest();
  const parsed = boardSchema.safeParse({
    url: formData.get("url"),
    companyName: formData.get("companyName") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid public ATS URL." };
  }

  const classified = classifyUrl(parsed.data.url);
  if (classified?.board && supportsBoardSync(classified.board.atsType)) {
    const identity = classified.board;
    db.insert(companyBoards)
      .values({
        atsType: identity.atsType,
        canonicalKey: identity.canonicalKey,
        companyName: parsed.data.companyName,
        slug: identity.slug,
        baseUrl: identity.baseUrl,
        config: identity.config,
        enabled: true,
        discoveredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: companyBoards.canonicalKey,
        set: {
          companyName: parsed.data.companyName,
          baseUrl: identity.baseUrl,
          config: identity.config,
          enabled: true,
        },
      })
      .run();

    revalidatePath("/");
    revalidatePath("/sources");
    return { ok: true, message: `${identity.atsType} board added.` };
  }

  const url = new URL(parsed.data.url);
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const existingSource = db
    .select()
    .from(sourceDomains)
    .where(eq(sourceDomains.pattern, hostname))
    .get();
  if (existingSource) {
    db.update(sourceDomains)
      .set({ enabled: true })
      .where(eq(sourceDomains.id, existingSource.id))
      .run();
    revalidatePath("/sources");
    return {
      ok: true,
      message: `${getAtsIntegration(existingSource.atsType).label} already covers ${hostname}; its source is enabled.`,
    };
  }
  if (classified && !classified.board && isBuiltInAtsType(classified.atsType)) {
    db.update(sourceDomains)
      .set({ enabled: true })
      .where(eq(sourceDomains.atsType, classified.atsType))
      .run();
    revalidatePath("/sources");
    return {
      ok: true,
      message: `${getAtsIntegration(classified.atsType).label} is already covered by the built-in search source.`,
    };
  }
  const existingIds = db
    .select({ atsType: atsIntegrations.atsType })
    .from(atsIntegrations)
    .all()
    .map((integration) => integration.atsType);
  const suggestion = suggestSearchIntegration(parsed.data.url, existingIds);
  const atsType = classified?.atsType ?? suggestion.atsType;
  const existingIntegration = classified ? getAtsIntegration(classified.atsType) : null;
  const priority =
    existingIntegration?.priority ?? getJobRadarConfig().integrationPolicy.customPriority;
  const now = new Date();

  db.transaction((transaction) => {
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
          updatedAt: now,
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
        set: {
          atsType,
          enabled: true,
          supportsBoardSync: false,
          priority,
        },
      })
      .run();
  });

  revalidatePath("/");
  revalidatePath("/sources");
  revalidatePath("/settings");
  const label = classified ? getAtsIntegration(atsType).label : suggestion.label;
  return {
    ok: true,
    message: `${label} search source added. Enable unverified leads on the profile to see its matches.`,
  };
}

export async function syncBoardsAction(): Promise<ActionState> {
  await assertLocalRequest();
  try {
    const results = await syncEnabledBoards();
    const failed = results.filter((result) => result.error).length;
    const writes = results.reduce((total, result) => total + result.created + result.updated, 0);
    revalidatePath("/");
    revalidatePath("/runs");
    revalidatePath("/sources");
    return {
      ok: failed === 0,
      message:
        failed === 0
          ? `Refreshed ${results.length} boards and wrote ${writes} jobs.`
          : `Refreshed with ${failed} board error${failed === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
