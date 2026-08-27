import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("./routes/jobs.tsx"),
  route("profiles", "./routes/profiles.tsx"),
  route("sources", "./routes/sources.tsx"),
  route("runs", "./routes/runs.tsx"),
  route("runs/:runId", "./routes/run-detail.tsx"),
  route(
    "recruiter-research",
    "../../../recruiter-engagement/composition/web/routes/recruiter-research.tsx",
  ),
  route("settings", "./routes/settings.tsx"),
  route("api/discovery-runs", "./routes/discovery-runs.ts"),
] satisfies RouteConfig;
