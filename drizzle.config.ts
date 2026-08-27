import "dotenv/config";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/contexts/discovery/infrastructure/sqlite/schema.ts",
    "./src/contexts/recruiter-engagement/infrastructure/sqlite/schema.ts",
  ],
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.DB_PATH ?? "./data/job-radar.sqlite",
  },
  strict: true,
  verbose: true,
});
