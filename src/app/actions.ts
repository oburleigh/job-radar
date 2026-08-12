"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db/client";
import {
  appSettings,
  atsIntegrations,
  companyBoards,
  jobStates,
  searchProfiles,
  sourceDomains,
} from "@/db/schema";
import { ATS_TYPES } from "@/lib/discovery/types";
import { getAtsIntegration, getJobRadarConfig, supportsBoardSync } from "@/config/job-radar";
import { suggestSearchIntegration } from "@/lib/discovery/custom-integration";
import { syncEnabledBoards } from "@/lib/discovery/sync";
import { isBuiltInAtsType } from "@/lib/discovery/types";
import { classifyUrl } from "@/lib/discovery/urls";
import { assertLocalHost } from "@/lib/local-request";

export interface ActionState {
  ok: boolean;
  message: string;
}

const optionalSalaryAmount = z.preprocess(
  (value) => (value === "" || value === null ? null : value),
  z.coerce.number().int().positive().max(100_000_000).nullable(),
);

const profileSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    name: z.string().trim().min(2).max(120),
    titleTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    locationTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
    requiredJobTerms: z.string().transform(splitLines),
    excludedTitleTerms: z.string().transform(splitLines),
    excludedLocationTerms: z.string().transform(splitLines),
    excludedDescriptionTerms: z.string().transform(splitLines),
    includeRemote: z.coerce.boolean(),
    includeUnverified: z.coerce.boolean(),
    salaryCurrency: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .refine((value) => value === "" || /^[A-Z]{3}$/.test(value), {
        message: "Salary currency must be a three-letter code such as GBP.",
      }),
    salaryMin: optionalSalaryAmount,
    salaryMax: optionalSalaryAmount,
    maxAgeDays: z.coerce.number().int().min(1).max(365),
    minScore: z.coerce.number().int().min(0).max(100),
  })
  .superRefine((profile, context) => {
    if ((profile.salaryMin !== null || profile.salaryMax !== null) && !profile.salaryCurrency) {
      context.addIssue({
        code: "custom",
        path: ["salaryCurrency"],
        message: "Add a salary currency when setting a salary range.",
      });
    }
    if (
      profile.salaryMin !== null &&
      profile.salaryMax !== null &&
      profile.salaryMin > profile.salaryMax
    ) {
      context.addIssue({
        code: "custom",
        path: ["salaryMax"],
        message: "Salary maximum must be at least the salary minimum.",
      });
    }
  });

const boardSchema = z.object({
  url: z.url(),
  companyName: z.string().trim().max(255),
});

const jobStateSchema = z.object({
  profileId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  status: z.enum(["new", "saved", "applied", "hidden"]),
});

const runtimeSettingsSchema = z.object({
  timeoutMs: z.coerce.number().int().min(1000).max(120000),
  userAgent: z.string().trim().min(3).max(200),
  resultsPerQuery: z.coerce.number().int().min(1).max(100),
  boardJobLimit: z.coerce.number().int().min(1).max(2000),
  searchFreshnessDays: z.coerce.number().int().min(0).max(365),
  titleSearchMode: z.enum(["title", "anywhere"]),
  discoveryPollIntervalMs: z.coerce.number().int().min(1000).max(60000),
  discoveryStaleAfterMs: z.coerce.number().int().min(60000).max(3600000),
  exactTitleScore: z.coerce.number().int().min(0).max(100),
  fullTokenScore: z.coerce.number().int().min(0).max(100),
  partialTokenScore: z.coerce.number().int().min(0).max(100),
  partialTokenThreshold: z.coerce.number().min(0).max(1),
  locationScore: z.coerce.number().int().min(0).max(100),
  remoteScore: z.coerce.number().int().min(0).max(100),
  unknownDateScore: z.coerce.number().int().min(0).max(100),
  freshnessMaxScore: z.coerce.number().int().min(0).max(100),
  freshnessMinimumScore: z.coerce.number().int().min(0).max(100),
  freshnessStepDays: z.coerce.number().int().min(1).max(365),
  stopWords: z.string().transform(splitLines),
  genericTitleTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  remoteTerms: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  searchProviders: z.record(
    z.string().min(1),
    z.object({
      endpoint: z.url(),
      maxResults: z.coerce.number().int().min(1).max(100),
      titleSearchMode: z.union([z.literal(""), z.enum(["title", "anywhere"])]),
    }),
  ),
});

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

export async function saveProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertLocalRequest();
  const parsed = profileSchema.safeParse({
    id: optionalFormValue(formData, "id"),
    name: formData.get("name"),
    titleTerms: formData.get("titleTerms"),
    locationTerms: formData.get("locationTerms"),
    requiredJobTerms: formData.get("requiredJobTerms") ?? "",
    excludedTitleTerms: formData.get("excludedTitleTerms") ?? "",
    excludedLocationTerms: formData.get("excludedLocationTerms") ?? "",
    excludedDescriptionTerms: formData.get("excludedDescriptionTerms") ?? "",
    includeRemote: formData.get("includeRemote") === "on",
    includeUnverified: formData.get("includeUnverified") === "on",
    salaryCurrency: formData.get("salaryCurrency") ?? "",
    salaryMin: formData.get("salaryMin"),
    salaryMax: formData.get("salaryMax"),
    maxAgeDays: formData.get("maxAgeDays"),
    minScore: formData.get("minScore"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid profile",
    };
  }

  const values = parsed.data;
  const duplicate = db
    .select({ id: searchProfiles.id })
    .from(searchProfiles)
    .where(
      values.id
        ? and(eq(searchProfiles.name, values.name), ne(searchProfiles.id, values.id))
        : eq(searchProfiles.name, values.name),
    )
    .get();
  if (duplicate) {
    return { ok: false, message: "A profile with that name already exists." };
  }

  const now = new Date();
  let createdId: number | undefined;
  if (values.id) {
    db.update(searchProfiles)
      .set({
        name: values.name,
        titleTerms: values.titleTerms,
        locationTerms: values.locationTerms,
        requiredJobTerms: values.requiredJobTerms,
        excludedTitleTerms: values.excludedTitleTerms,
        excludedLocationTerms: values.excludedLocationTerms,
        excludedDescriptionTerms: values.excludedDescriptionTerms,
        includeRemote: values.includeRemote,
        includeUnverified: values.includeUnverified,
        salaryCurrency: values.salaryCurrency,
        salaryMin: values.salaryMin,
        salaryMax: values.salaryMax,
        maxAgeDays: values.maxAgeDays,
        minScore: values.minScore,
        updatedAt: now,
      })
      .where(eq(searchProfiles.id, values.id))
      .run();
  } else {
    createdId = db
      .insert(searchProfiles)
      .values({
        name: values.name,
        titleTerms: values.titleTerms,
        locationTerms: values.locationTerms,
        requiredJobTerms: values.requiredJobTerms,
        excludedTitleTerms: values.excludedTitleTerms,
        excludedLocationTerms: values.excludedLocationTerms,
        excludedDescriptionTerms: values.excludedDescriptionTerms,
        includeRemote: values.includeRemote,
        includeUnverified: values.includeUnverified,
        salaryCurrency: values.salaryCurrency,
        salaryMin: values.salaryMin,
        salaryMax: values.salaryMax,
        maxAgeDays: values.maxAgeDays,
        minScore: values.minScore,
        enabled: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: searchProfiles.id })
      .get().id;
  }

  revalidatePath("/");
  revalidatePath("/profiles");
  if (createdId) {
    redirect(`/profiles?profile=${createdId}`);
  }
  return { ok: true, message: "Profile saved." };
}

export async function deleteProfileAction(profileId: number): Promise<ActionState> {
  let destination = "/profiles?new=1";
  try {
    await assertLocalRequest();
    const parsed = z.number().int().positive().safeParse(profileId);
    if (!parsed.success) {
      return { ok: false, message: "Invalid profile." };
    }

    const existing = db
      .select({ id: searchProfiles.id })
      .from(searchProfiles)
      .where(eq(searchProfiles.id, parsed.data))
      .get();
    if (!existing) {
      return { ok: false, message: "Profile not found." };
    }

    const nextProfile = db
      .select({ id: searchProfiles.id })
      .from(searchProfiles)
      .where(ne(searchProfiles.id, parsed.data))
      .orderBy(searchProfiles.name)
      .limit(1)
      .get();
    db.delete(searchProfiles).where(eq(searchProfiles.id, parsed.data)).run();

    if (nextProfile) {
      destination = `/profiles?profile=${nextProfile.id}`;
    }
    revalidatePath("/");
    revalidatePath("/profiles");
    revalidatePath("/runs");
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  redirect(destination);
}

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
  const priority = existingIntegration?.priority ?? 200;
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

export async function updateJobStateAction(
  profileId: number,
  jobId: number,
  status: "new" | "saved" | "applied" | "hidden",
): Promise<ActionState> {
  await assertLocalRequest();
  const parsed = jobStateSchema.safeParse({ profileId, jobId, status });
  if (!parsed.success) {
    return { ok: false, message: "Invalid job status." };
  }

  db.insert(jobStates)
    .values({
      ...parsed.data,
      notes: "",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [jobStates.profileId, jobStates.jobId],
      set: { status: parsed.data.status, updatedAt: new Date() },
    })
    .run();

  revalidatePath("/");
  return { ok: true, message: "Job status updated." };
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
    return { ok: false, message: errorMessage(error) };
  }
}

export async function saveRuntimeSettingsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertLocalRequest();
  const current = getJobRadarConfig();
  const searchProviders = Object.fromEntries(
    Object.keys(current.searchProviders).map((name) => [
      name,
      {
        endpoint: formData.get(`provider:${name}:endpoint`),
        maxResults: formData.get(`provider:${name}:maxResults`),
        titleSearchMode: formData.get(`provider:${name}:titleSearchMode`),
      },
    ]),
  );
  const parsed = runtimeSettingsSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    searchProviders,
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid settings.",
    };
  }

  const values = parsed.data;
  const rows = [
    {
      key: "network",
      value: {
        timeoutMs: values.timeoutMs,
        userAgent: values.userAgent,
      },
    },
    {
      key: "discovery",
      value: {
        resultsPerQuery: values.resultsPerQuery,
        boardJobLimit: values.boardJobLimit,
        searchFreshnessDays: values.searchFreshnessDays,
        titleSearchMode: values.titleSearchMode,
      },
    },
    {
      key: "matching",
      value: {
        exactTitleScore: values.exactTitleScore,
        fullTokenScore: values.fullTokenScore,
        partialTokenScore: values.partialTokenScore,
        partialTokenThreshold: values.partialTokenThreshold,
        locationScore: values.locationScore,
        remoteScore: values.remoteScore,
        unknownDateScore: values.unknownDateScore,
        freshnessMaxScore: values.freshnessMaxScore,
        freshnessMinimumScore: values.freshnessMinimumScore,
        freshnessStepDays: values.freshnessStepDays,
        stopWords: values.stopWords,
        genericTitleTerms: values.genericTitleTerms,
        remoteTerms: values.remoteTerms,
      },
    },
    {
      key: "ui",
      value: {
        discoveryPollIntervalMs: values.discoveryPollIntervalMs,
        discoveryStaleAfterMs: values.discoveryStaleAfterMs,
      },
    },
    {
      key: "searchProviders",
      value: Object.fromEntries(
        Object.entries(current.searchProviders).map(([name, provider]) => {
          const updated = values.searchProviders[name];
          return [
            name,
            updated
              ? {
                  ...provider,
                  endpoint: updated.endpoint,
                  maxResults: updated.maxResults,
                  titleSearchMode: updated.titleSearchMode === "" ? null : updated.titleSearchMode,
                }
              : provider,
          ];
        }),
      ),
    },
  ] as const;
  const now = new Date();

  db.transaction((transaction) => {
    for (const row of rows) {
      transaction
        .insert(appSettings)
        .values({ ...row, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: row.value, updatedAt: now },
        })
        .run();
    }
  });

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, message: "Runtime settings saved to SQLite." };
}

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

async function assertLocalRequest(): Promise<void> {
  assertLocalHost((await headers()).get("host") ?? "");
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

function optionalFormValue(formData: FormData, key: string): FormDataEntryValue | undefined {
  const value = formData.get(key);
  return value === null || value === "" ? undefined : value;
}

function hostnameFromPattern(pattern: string): string {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(pattern) ? pattern : `https://${pattern}`);
    return url.hostname.replace(/^\*\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
