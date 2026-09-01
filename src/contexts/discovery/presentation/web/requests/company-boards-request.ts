import { z } from "zod";

import type { SetSourceCoverageEnabledCommand } from "@/contexts/discovery/application/source-coverage/set-enabled/command";

const enabledSchema = z.enum(["true", "false"]);

type CompanyBoardsRequestResult =
  | { readonly ok: true; readonly command: SetSourceCoverageEnabledCommand }
  | { readonly ok: false; readonly message: string };

export function parseCompanyBoardsRequest(formData: FormData): CompanyBoardsRequestResult {
  const enabled = enabledSchema.safeParse(formData.get("enabled"));
  if (!enabled.success) {
    return { ok: false, message: "Choose whether company boards are enabled." };
  }
  return {
    ok: true,
    command: {
      kind: "company-boards",
      enabled: enabled.data === "true",
    },
  };
}
