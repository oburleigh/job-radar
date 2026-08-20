import "dotenv/config";

import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { db } from "../src/contexts/discovery/infrastructure/sqlite/database";

migrate(db, {
  migrationsFolder: path.resolve(process.cwd(), "drizzle"),
});

console.log("Database migrations applied.");
