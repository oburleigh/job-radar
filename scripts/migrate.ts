import "dotenv/config";

import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { bootstrapJobRadar } from "@/contexts/discovery/infrastructure/configuration/bootstrap-job-radar";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";

migrate(db, {
  migrationsFolder: path.resolve(process.cwd(), "drizzle"),
});
bootstrapJobRadar(db);

console.log("Database schema and product defaults are ready.");
