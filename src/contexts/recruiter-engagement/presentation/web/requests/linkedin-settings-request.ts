import { z } from "zod";

import { parseLoopbackHttpUrl } from "@/platform/http/loopback-http-url";

const requestSchema = z.object({
  mcpEndpoint: z
    .string()
    .trim()
    .refine((value) => value === "" || parseLoopbackHttpUrl(value) !== null)
    .transform((value) => (value === "" ? null : value)),
});

export type LinkedInSettingsRequestResult =
  | { readonly command: { readonly mcpEndpoint: string | null }; readonly ok: true }
  | { readonly field: "mcpEndpoint"; readonly message: string; readonly ok: false };

export function parseLinkedInSettingsRequest(formData: FormData): LinkedInSettingsRequestResult {
  const parsed = requestSchema.safeParse({ mcpEndpoint: formData.get("mcpEndpoint") ?? "" });
  if (!parsed.success) {
    return {
      field: "mcpEndpoint",
      message: "Enter a loopback HTTP URL such as http://127.0.0.1:8765/mcp.",
      ok: false,
    };
  }
  return { command: parsed.data, ok: true };
}
