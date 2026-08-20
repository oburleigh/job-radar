import { z } from "zod";

export const vendorTextValue = z.union([z.string(), z.number().finite()]);
export const optionalVendorTextValue = vendorTextValue.optional();

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
