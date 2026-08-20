import { z } from "zod";

import type { SaveAtsIntegrationCommand } from "../../../application/ats-integrations/save/command";

export type AtsIntegrationRequestResult =
  | { readonly ok: true; readonly command: SaveAtsIntegrationCommand }
  | { readonly ok: false; readonly message: string };

const integrationSettingsSchema = z.object({
  atsType: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,39}$/, {
      message: "Integration ID must use 2-40 lowercase letters, numbers, or hyphens.",
    }),
  isNew: z.boolean(),
  label: z.string().trim().min(1).max(80),
  searchPatterns: z.string().transform(splitLines).pipe(z.array(z.string()).min(1)),
  hostnames: z.string().transform(splitLines),
  hostSuffixes: z.string().transform(splitLines),
  supportsBoardSync: z.coerce.boolean(),
  priority: z.coerce.number().int().min(0).max(10000),
  pageSize: z.union([z.literal(""), z.coerce.number().int().positive().max(1000)]),
  endpoints: z.string().transform((value, context) => {
    try {
      return z.record(z.string(), z.url()).parse(JSON.parse(value) as unknown);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Endpoints must be a JSON object containing valid URLs.",
      });
      return z.NEVER;
    }
  }),
});

export function parseAtsIntegrationRequest(formData: FormData): AtsIntegrationRequestResult {
  const parsed = integrationSettingsSchema.safeParse({
    ...Object.fromEntries(formData.entries()),
    isNew: formData.get("isNew") === "1",
    supportsBoardSync: formData.get("supportsBoardSync") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Invalid integration.",
    };
  }

  const values = parsed.data;
  const hostnames =
    values.hostnames.length > 0
      ? values.hostnames
      : values.searchPatterns.map(hostnameFromPattern).filter(Boolean);
  return {
    ok: true,
    command: {
      atsType: values.atsType,
      isNew: values.isNew,
      label: values.label,
      searchPatterns: values.searchPatterns,
      hostnames,
      hostSuffixes: values.hostSuffixes,
      supportsBoardSync: values.supportsBoardSync,
      priority: values.priority,
      pageSize: values.pageSize === "" ? null : values.pageSize,
      endpoints: values.endpoints,
    },
  };
}

function splitLines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function hostnameFromPattern(pattern: string): string {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(pattern) ? pattern : `https://${pattern}`);
    return url.hostname.replace(/^\*\./, "").toLowerCase();
  } catch {
    return "";
  }
}
