"use server";

import { eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/contexts/discovery/adapters/driven/sqlite/database";
import { searchProfiles } from "@/contexts/discovery/adapters/driven/sqlite/schema";
import { createSqliteSearchProfileRepository } from "@/contexts/discovery/adapters/driven/sqlite/search-profile-repository";
import { createSaveSearchProfile } from "@/contexts/discovery/hexagon/application/save-search-profile";

import type { ActionState } from "./action-state";
import { assertLocalRequest } from "./assert-local-request";
import { createSaveProfileAction } from "./save-profile-action";

const saveSearchProfile = createSaveSearchProfile({
  profiles: createSqliteSearchProfileRepository(db),
  now: () => new Date(),
});

export const saveProfileAction = createSaveProfileAction({
  assertLocalRequest,
  saveSearchProfile,
  revalidatePath,
  redirect,
});

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
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }

  redirect(destination);
}
