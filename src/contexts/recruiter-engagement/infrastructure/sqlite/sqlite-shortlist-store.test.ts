import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import type { Shortlist } from "@/contexts/recruiter-engagement/domain/shortlist";
import { initializeTestSchema } from "~/tests/support/current-schema";
import { createSqliteShortlistStore } from "./sqlite-shortlist-store";

describe("SQLite Shortlist store", () => {
  it("retains named Shortlists and explicit Prospect contact exclusions across restarts", async () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    initializeTestSchema(database);
    const firstProcess = createSqliteShortlistStore(
      database,
      () => new Date("2026-08-30T10:05:00.000Z"),
    );
    const shortlist: Shortlist = {
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      id: "shortlist-1",
      name: "UAE software recruiters",
      prospects: [
        {
          addedAt: new Date("2026-08-30T10:01:00.000Z"),
          contactExclusion: "do-not-contact",
          recruiterId: "recruiter:linkedin.com/in/amina-khan",
        },
      ],
    };

    await firstProcess.save(shortlist);

    const restartedProcess = createSqliteShortlistStore(database);
    await expect(restartedProcess.list()).resolves.toEqual([shortlist]);
  });

  it("lists Shortlists in creation order rather than identifier order", async () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    initializeTestSchema(database);
    const store = createSqliteShortlistStore(database);
    const later: Shortlist = {
      createdAt: new Date("2026-08-30T11:00:00.000Z"),
      id: "shortlist-a",
      name: "Later Shortlist",
      prospects: [],
    };
    const earlier: Shortlist = {
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      id: "shortlist-z",
      name: "Earlier Shortlist",
      prospects: [],
    };

    await store.save(later);
    await store.save(earlier);

    await expect(store.list()).resolves.toEqual([earlier, later]);
  });

  it("rejects a persisted Shortlist whose payload identity differs from its SQLite identity", async () => {
    const sqlite = new Database(":memory:");
    const database = drizzle(sqlite);
    initializeTestSchema(database);
    sqlite
      .prepare("INSERT INTO recruiter_shortlists (id, payload, updated_at) VALUES (?, ?, ?)")
      .run(
        "shortlist-1",
        JSON.stringify({
          createdAt: "2026-08-30T10:00:00.000Z",
          id: "shortlist-2",
          name: "UAE software recruiters",
          prospects: [],
        }),
        Date.now(),
      );

    await expect(createSqliteShortlistStore(database).get("shortlist-1")).rejects.toThrow(
      "Persisted Shortlist shortlist-1 contains identity shortlist-2.",
    );
  });
});
