import { z } from "zod";

import type { SetSourceCoverageEnabledCommand } from "@/contexts/discovery/application/source-coverage/set-enabled/command";

const enabledSchema = z.enum(["true", "false"]);

type CompanyBoardRefreshRequestResult =
  | { readonly ok: true; readonly command: SetSourceCoverageEnabledCommand }
  | { readonly ok: false; readonly message: string };

export function parseCompanyBoardRefreshRequest(
  formData: FormData,
): CompanyBoardRefreshRequestResult {
  const enabled = enabledSchema.safeParse(formData.get("enabled"));
  if (!enabled.success) {
    return { ok: false, message: "Choose whether company boards are refreshed." };
  }
  return {
    ok: true,
    command: {
      kind: "company-board-refresh",
      enabled: enabled.data === "true",
    },
  };
}
