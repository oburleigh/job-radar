"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { jobStates } from "@/contexts/discovery/adapters/driven/sqlite/schema";

import type { ActionState } from "./action-state";
import { assertLocalRequest } from "./assert-local-request";

const jobStateSchema = z.object({
  profileId: z.number().int().positive(),
  jobId: z.number().int().positive(),
  status: z.enum(["new", "saved", "applied", "hidden"]),
});

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
