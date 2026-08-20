import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src/contexts/discovery/composition/web",
  buildDirectory: "build",
  serverModuleFormat: "esm",
  ssr: true,
} satisfies Config;
