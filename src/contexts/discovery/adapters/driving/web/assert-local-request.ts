import { headers } from "next/headers";

import { assertLocalHost } from "@/platform/http/require-local-request";

export async function assertLocalRequest(): Promise<void> {
  assertLocalHost((await headers()).get("host") ?? "");
}
