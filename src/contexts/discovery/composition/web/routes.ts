import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("./routes/jobs.tsx"),
  route("profiles", "./routes/profiles.tsx"),
  route("sources", "./routes/legacy-sources-redirect.ts"),
  route("runs", "./routes/legacy-runs-redirect.ts"),
  route("runs/:runId", "./routes/run-detail.tsx"),
  route("activity", "./routes/activity.tsx"),
  route(
    "recruiter-search",
    "../../../recruiter-engagement/composition/web/routes/recruiter-research.tsx",
  ),
  route("recruiter-research", "./routes/legacy-recruiter-search-redirect.ts"),
  route("settings", "./routes/settings-layout.tsx", [
    index("./routes/settings-index.ts"),
    route("opportunities", "./routes/settings-opportunities.tsx"),
    route("recruiter-search", "./routes/settings-recruiter-search.tsx"),
    route("adapters", "./routes/settings-adapters-layout.tsx", [
      index("./routes/settings-adapters-index.ts"),
      route("source-coverage", "./routes/sources.tsx"),
      route("ats-registry", "./routes/settings-ats-registry.tsx"),
    ]),
  ]),
  route("api/discovery-runs", "./routes/discovery-runs.ts"),
  route("api/location-options", "./routes/location-options.ts"),
] satisfies RouteConfig;
