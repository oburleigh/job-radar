import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src/contexts/discovery/presentation/web",
  buildDirectory: "build",
  serverModuleFormat: "esm",
  ssr: true,
} satisfies Config;
