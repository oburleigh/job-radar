import { z } from "zod";

export const vendorTextValue = z.union([z.string(), z.number().finite()]);
export const optionalVendorTextValue = vendorTextValue.optional();

export interface RejectedVendorRecord {
  readonly vendor: string;
  readonly board: string;
  readonly recordIdentity?: string;
  readonly reason: string;
}

export type ReportRejectedVendorRecord = (record: RejectedVendorRecord) => void;

export function parseVendorResponse<Output>(
  vendor: string,
  schema: z.ZodType<Output>,
  payload: unknown,
): Output {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  throw new Error(`${vendor} returned an invalid response: ${z.prettifyError(parsed.error)}`, {
    cause: parsed.error,
  });
}

export function parseVendorRecords<Output>({
  vendor,
  board,
  records,
  schema,
  identityKeys,
  reportRejected,
}: {
  readonly vendor: string;
  readonly board: string;
  readonly records: readonly unknown[];
  readonly schema: z.ZodType<Output>;
  readonly identityKeys: readonly string[];
  readonly reportRejected?: ReportRejectedVendorRecord;
}): Output[] {
  const accepted: Output[] = [];
  for (const record of records) {
    const parsed = schema.safeParse(record);
    if (parsed.success) {
      accepted.push(parsed.data);
      continue;
    }
    const recordIdentity = vendorRecordIdentity(record, identityKeys);
    const rejection = {
      vendor,
      board,
      reason: conciseValidationReason(parsed.error),
    };
    reportRejected?.(recordIdentity === undefined ? rejection : { ...rejection, recordIdentity });
  }
  return accepted;
}

export function formatRejectedVendorRecords(records: readonly RejectedVendorRecord[]): string {
  if (records.length === 0) {
    return "";
  }
  const details = records
    .slice(0, 3)
    .map(
      (record) =>
        `${record.vendor} ${record.board}${record.recordIdentity ? ` ${record.recordIdentity}` : ""}: ${record.reason}`,
    )
    .join("; ");
  const omitted = records.length - Math.min(records.length, 3);
  return `Skipped ${records.length} invalid vendor ${records.length === 1 ? "record" : "records"}. ${details}${omitted > 0 ? `; ${omitted} more` : ""}`;
}

function vendorRecordIdentity(value: unknown, identityKeys: readonly string[]): string | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of identityKeys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return undefined;
}

function conciseValidationReason(error: z.ZodError): string {
  const reason = error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`)
    .join("; ");
  return reason.length > 500 ? `${reason.slice(0, 497)}...` : reason;
}
