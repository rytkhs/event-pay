import { headers } from "next/headers";

import { getClientIPFromHeaders } from "@core/utils/ip-detection";

export async function getRequestIp(): Promise<string | undefined> {
  try {
    const headersList = await headers();
    return getClientIPFromHeaders(headersList) ?? undefined;
  } catch {
    return undefined;
  }
}
