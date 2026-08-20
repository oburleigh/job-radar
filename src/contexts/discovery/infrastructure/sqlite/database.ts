import { drizzle } from "drizzle-orm/better-sqlite3";

import { sqlite } from "@/platform/sqlite/client";

import * as schema from "./schema";

export const db = drizzle(sqlite, { schema });
