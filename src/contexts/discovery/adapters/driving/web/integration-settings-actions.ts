"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ATS_TYPES } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { atsIntegrations, sourceDomains } from "@/contexts/discovery/adapters/driven/sqlite/schema";

import type { ActionState } from "./action-state";
import { assertLocalRequest } from "./assert-local-request";

const integrationSettingsSchema = z.object({
  atsType: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, {
      message: "Integration ID must use 2-40 lowercase letters, numbers, or hyphens.",
    }),
  isNew: z.boolean(),
  label: z.string().trim().min(1).max(80),
  searchPatterns: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  hostnames: z.string().transform(splitLines),
  hostSuffixes: z.string().transform(splitLines),
  supportsBoardSync: z.coerce.boolean(),
  priority: z.coerce.number().int().min(0).max(10000),
  pageSize: z.union([z.literal(""), z.coerce.number().int().positive().max(1000)]),
  endpoints: z.string().transform((value, context) => {
    try {
      return z.record(z.string(), z.url()).parse(JSON.parse(value) as unknown);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Endpoints must be a JSON object containing valid URLs.",
      });
      return z.NEVER;
    }
  }),
});

export async function saveIntegrationSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertLocalRequest();
  const parsed = integrationSettingsSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    isNew: formData.get("isNew") === "1",
    supportsBoardSync: formData.get("supportsBoardSync") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid integration.",
    };
  }

  const values = parsed.data;
  const isBuiltIn = (ATS_TYPES as readonly string[]).includes(values.atsType);
  if (!isBuiltIn && values.supportsBoardSync) {
    return {
      ok: false,
      message: "Custom integrations are search-only until a direct connector is implemented.",
    };
  }
  const existingIntegration = db
    .select({ atsType: atsIntegrations.atsType })
    .from(atsIntegrations)
    .where(eq(atsIntegrations.atsType, values.atsType))
    .get();
  if (values.isNew && existingIntegration) {
    return { ok: false, message: "That integration ID already exists." };
  }
  if (!values.isNew && !existingIntegration) {
    return { ok: false, message: "Integration not found." };
  }
  const conflictingPattern = db
    .select({
      atsType: sourceDomains.atsType,
      pattern: sourceDomains.pattern,
    })
    .from(sourceDomains)
    .all()
    .find(
      (source) =>
        values.searchPatterns.includes(source.pattern) && source.atsType !== values.atsType,
    );
  if (conflictingPattern) {
    return {
      ok: false,
      message: `${conflictingPattern.pattern} already belongs to ${conflictingPattern.atsType}.`,
    };
  }
  const hostnames =
    values.hostnames.length > 0
      ? values.hostnames
      : values.searchPatterns.map(hostnameFromPattern).filter(Boolean);
  if (!isBuiltIn && hostnames.length === 0 && values.hostSuffixes.length === 0) {
    return {
      ok: false,
      message: "Add an exact hostname or suffix so custom result URLs can be recognized.",
    };
  }
  const now = new Date();
  db.transaction((transaction) => {
    transaction
      .insert(atsIntegrations)
      .values({
        atsType: values.atsType,
        label: values.label,
        hostnames,
        hostSuffixes: values.hostSuffixes,
        supportsBoardSync: isBuiltIn && values.supportsBoardSync,
        priority: values.priority,
        pageSize: values.pageSize === "" ? null : values.pageSize,
        endpoints: isBuiltIn ? values.endpoints : {},
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: atsIntegrations.atsType,
        set: {
          label: values.label,
          hostnames,
          hostSuffixes: values.hostSuffixes,
          supportsBoardSync: isBuiltIn && values.supportsBoardSync,
          priority: values.priority,
          pageSize: values.pageSize === "" ? null : values.pageSize,
          endpoints: isBuiltIn ? values.endpoints : {},
          updatedAt: now,
        },
      })
      .run();

    const currentSources = transaction
      .select()
      .from(sourceDomains)
      .where(eq(sourceDomains.atsType, values.atsType))
      .all();
    for (const source of currentSources) {
      transaction
        .update(sourceDomains)
        .set({ enabled: values.searchPatterns.includes(source.pattern) })
        .where(eq(sourceDomains.id, source.id))
        .run();
    }
    for (const [index, pattern] of values.searchPatterns.entries()) {
      transaction
        .insert(sourceDomains)
        .values({
          atsType: values.atsType,
          pattern,
          enabled: true,
          supportsBoardSync: values.supportsBoardSync,
          priority: values.priority + index,
        })
        .onConflictDoUpdate({
          target: sourceDomains.pattern,
          set: {
            atsType: values.atsType,
            enabled: true,
            supportsBoardSync: values.supportsBoardSync,
            priority: values.priority + index,
          },
        })
        .run();
    }
  });

  revalidatePath("/");
  revalidatePath("/sources");
  revalidatePath("/settings");
  if (values.isNew) {
    redirect(`/settings?ats=${encodeURIComponent(values.atsType)}`);
  }
  return { ok: true, message: `${values.label} settings saved to SQLite.` };
}

function splitLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function hostnameFromPattern(pattern: string): string {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(pattern) ? pattern : `https://${pattern}`);
    return url.hostname.replace(/^\*\./, "").toLowerCase();
  } catch {
    return "";
  }
}
