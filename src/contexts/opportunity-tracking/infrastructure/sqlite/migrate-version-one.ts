import type Database from "better-sqlite3";

export function migrateOpportunityTrackingFromVersionOne(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE \`applications\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`search_profile_id\` integer NOT NULL,
      \`job_listing_id\` integer NOT NULL,
      \`stage\` text NOT NULL,
      \`created_at\` integer NOT NULL,
      \`updated_at\` integer NOT NULL
    );
    CREATE UNIQUE INDEX \`applications_profile_listing_idx\` ON \`applications\` (\`search_profile_id\`,\`job_listing_id\`);
    CREATE INDEX \`applications_stage_idx\` ON \`applications\` (\`stage\`);

    CREATE TABLE \`next_actions\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`application_id\` integer NOT NULL,
      \`title\` text NOT NULL,
      \`reason\` text NOT NULL,
      \`state\` text DEFAULT 'open' NOT NULL,
      \`due_at\` integer,
      \`created_at\` integer NOT NULL,
      \`updated_at\` integer NOT NULL,
      FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
    CREATE INDEX \`next_actions_state_due_idx\` ON \`next_actions\` (\`state\`,\`due_at\`);

    CREATE TABLE \`application_recommendations\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`application_id\` integer NOT NULL,
      \`source_kind\` text NOT NULL,
      \`source_record_id\` integer NOT NULL,
      \`title\` text NOT NULL,
      \`reason\` text NOT NULL,
      \`evidence_urls\` text NOT NULL,
      \`state\` text DEFAULT 'proposed' NOT NULL,
      \`accepted_next_action_id\` integer,
      \`created_at\` integer NOT NULL,
      \`updated_at\` integer NOT NULL,
      FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`accepted_next_action_id\`) REFERENCES \`next_actions\`(\`id\`) ON UPDATE no action ON DELETE no action
    );
    CREATE INDEX \`application_recommendations_application_state_idx\` ON \`application_recommendations\` (\`application_id\`,\`state\`);

    CREATE TABLE \`application_timeline\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`application_id\` integer NOT NULL,
      \`kind\` text NOT NULL,
      \`next_action_id\` integer,
      \`stage\` text NOT NULL,
      \`occurred_at\` integer NOT NULL,
      FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
    CREATE INDEX \`application_timeline_application_time_idx\` ON \`application_timeline\` (\`application_id\`,\`occurred_at\`);

    CREATE TABLE \`opportunity_assessments\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`search_profile_id\` integer NOT NULL,
      \`job_listing_id\` integer NOT NULL,
      \`summary\` text NOT NULL,
      \`strengths\` text NOT NULL,
      \`gaps\` text NOT NULL,
      \`evidence\` text NOT NULL,
      \`recommendations\` text NOT NULL,
      \`model\` text NOT NULL,
      \`reasoning_effort\` text NOT NULL,
      \`policy_version\` integer NOT NULL,
      \`schema_version\` integer NOT NULL,
      \`evidence_cutoff\` integer NOT NULL,
      \`created_at\` integer NOT NULL
    );
    CREATE INDEX \`opportunity_assessments_reference_time_idx\` ON \`opportunity_assessments\` (\`search_profile_id\`,\`job_listing_id\`,\`created_at\`);

    CREATE TABLE \`advisor_settings\` (
      \`key\` text PRIMARY KEY NOT NULL,
      \`value\` text NOT NULL,
      \`updated_at\` integer NOT NULL
    );

    CREATE TABLE \`relationship_plans\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`application_id\` integer NOT NULL,
      \`summary\` text NOT NULL,
      \`prospect_references\` text NOT NULL,
      \`public_people\` text NOT NULL,
      \`recommendations\` text NOT NULL,
      \`model\` text NOT NULL,
      \`reasoning_effort\` text NOT NULL,
      \`policy_version\` integer NOT NULL,
      \`schema_version\` integer NOT NULL,
      \`evidence_cutoff\` integer NOT NULL,
      \`created_at\` integer NOT NULL,
      FOREIGN KEY (\`application_id\`) REFERENCES \`applications\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );
    CREATE INDEX \`relationship_plans_application_time_idx\` ON \`relationship_plans\` (\`application_id\`,\`created_at\`);
    CREATE TABLE \`advisor_executions\` (
      \`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      \`kind\` text NOT NULL,
      \`search_profile_id\` integer NOT NULL,
      \`job_listing_id\` integer NOT NULL,
      \`application_id\` integer,
      \`policy\` text NOT NULL,
      \`started_at\` integer NOT NULL,
      \`finished_at\` integer,
      \`status\` text NOT NULL,
      \`reason\` text,
      \`retry_of\` integer
    );
    CREATE INDEX \`advisor_executions_owner_idx\` ON \`advisor_executions\` (\`kind\`,\`search_profile_id\`,\`job_listing_id\`,\`application_id\`);
  `);

  sqlite
    .prepare(
      `INSERT INTO applications (
        search_profile_id, job_listing_id, stage, created_at, updated_at
      )
      SELECT profile_id, job_id, 'applied', updated_at, updated_at
      FROM job_states
      WHERE status = 'applied'`,
    )
    .run();
  sqlite
    .prepare(
      `INSERT INTO application_timeline (application_id, kind, stage, occurred_at)
      SELECT applications.id, 'application-migrated', applications.stage, applications.created_at
      FROM applications
      INNER JOIN job_states
        ON job_states.profile_id = applications.search_profile_id
        AND job_states.job_id = applications.job_listing_id
      WHERE job_states.status = 'applied'`,
    )
    .run();
}
