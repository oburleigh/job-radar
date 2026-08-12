import { and, desc, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import { getJobRadarConfig } from "@/config/job-radar";
import { db } from "@/db/client";
import { discoveryRuns, searchProfiles } from "@/db/schema";
import { failStaleDiscoveryRuns, reserveDiscoveryRun, runDiscovery } from "@/lib/discovery/runner";
import { createSearchProvider } from "@/lib/discovery/search";
import { assertLocalHost } from "@/lib/local-request";

const startSchema = z.object({
  profileId: z.number().int().positive(),
  provider: z.string().trim().min(1),
});

const idsSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => Number.parseInt(item, 10))
      .filter((item) => Number.isInteger(item) && item > 0),
  )
  .pipe(z.array(z.number().int().positive()).max(25));

export async function GET(request: Request) {
  assertLocalHost(request.headers.get("host") ?? "");
  failStaleDiscoveryRuns();
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const activeOnly = url.searchParams.get("active") === "1";
  const parsedIds = idsParam ? idsSchema.safeParse(idsParam) : null;
  if (parsedIds && !parsedIds.success) {
    return Response.json({ message: "Invalid discovery run ids." }, { status: 400 });
  }
  if (!parsedIds && !activeOnly) {
    return Response.json({ message: "Request run ids or active runs." }, { status: 400 });
  }

  const requestedIds = parsedIds?.data ?? [];
  const runs = db
    .select({
      id: discoveryRuns.id,
      profileId: discoveryRuns.profileId,
      profileName: searchProfiles.name,
      provider: discoveryRuns.provider,
      status: discoveryRuns.status,
      hitCount: discoveryRuns.hitCount,
      jobsUpserted: discoveryRuns.jobsUpserted,
      matchesFound: discoveryRuns.matchesFound,
      queryErrorCount: discoveryRuns.queryErrorCount,
      syncErrorCount: discoveryRuns.syncErrorCount,
      error: discoveryRuns.error,
      startedAt: discoveryRuns.startedAt,
      finishedAt: discoveryRuns.finishedAt,
    })
    .from(discoveryRuns)
    .innerJoin(searchProfiles, eq(searchProfiles.id, discoveryRuns.profileId))
    .where(
      requestedIds.length > 0
        ? inArray(discoveryRuns.id, requestedIds)
        : eq(discoveryRuns.status, "running"),
    )
    .orderBy(desc(discoveryRuns.startedAt))
    .all();
  const foundIds = new Set(runs.map((run) => run.id));

  return Response.json(
    {
      runs,
      missingIds: requestedIds.filter((id) => !foundIds.has(id)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    assertLocalHost(request.headers.get("host") ?? "");
    const input = startSchema.safeParse(await request.json());
    if (!input.success || !getJobRadarConfig().searchProviders[input.data.provider]) {
      return Response.json({ ok: false, message: "Invalid discovery request." }, { status: 400 });
    }

    const provider = createSearchProvider(input.data.provider);
    const reserved = reserveDiscoveryRun(input.data.profileId, input.data.provider);
    if (reserved.created) {
      after(async () => {
        try {
          await runDiscovery(input.data.profileId, provider, {
            runId: reserved.runId,
          });
        } catch (error) {
          const message = errorMessage(error);
          db.update(discoveryRuns)
            .set({
              status: "failed",
              error: message,
              finishedAt: new Date(),
            })
            .where(and(eq(discoveryRuns.id, reserved.runId), eq(discoveryRuns.status, "running")))
            .run();
          console.error(`Discovery run ${reserved.runId} failed: ${message}`);
        }
      });
    }

    return Response.json(
      {
        ok: true,
        runId: reserved.runId,
        alreadyRunning: !reserved.created,
        message: reserved.created
          ? `Discovery #${reserved.runId} is running in the background. You can keep using the app.`
          : `Discovery #${reserved.runId} is already running for this profile.`,
      },
      { status: reserved.created ? 202 : 200 },
    );
  } catch (error) {
    return Response.json({ ok: false, message: errorMessage(error) }, { status: 400 });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
