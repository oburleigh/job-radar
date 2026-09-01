import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src/contexts/discovery/composition/web",
  buildDirectory: process.env.JOB_RADAR_BUILD_DIRECTORY?.trim() || "build",
  serverModuleFormat: "esm",
  ssr: true,
} satisfies Config;
