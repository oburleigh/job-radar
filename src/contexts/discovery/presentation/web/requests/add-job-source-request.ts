import { z } from "zod";

import type { AddJobSourceCommand } from "@/contexts/discovery/application/source-coverage/add/command";

const addJobSourceSchema = z.object({
  url: z.url(),
  companyName: z.string().trim().max(255),
});

export type AddJobSourceRequestResult =
  | { readonly ok: true; readonly command: AddJobSourceCommand }
  | { readonly ok: false; readonly message: string };

export function parseAddJobSourceRequest(formData: FormData): AddJobSourceRequestResult {
  const parsed = addJobSourceSchema.safeParse({
    url: formData.get("url"),
    companyName: formData.get("companyName") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid public ATS URL." };
  }
  return { ok: true, command: parsed.data };
}
