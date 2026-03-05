"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { resendOtpAction as resendOtpActionImpl } from "@features/auth/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

import { getRequestIp } from "./_shared/request-context";
import { projectAuthCommandResult } from "./_shared/result-projection";

/**
 * OTP再送信
 */
export async function resendOtpAction(formData: FormData): Promise<ActionResult> {
  ensureFeaturesRegistered();

  const result = await resendOtpActionImpl({
    email: formData.get("email")?.toString(),
    type: formData.get("type")?.toString(),
    requestContext: {
      ip: await getRequestIp(),
    },
  });

  return projectAuthCommandResult(result).actionResult;
}
