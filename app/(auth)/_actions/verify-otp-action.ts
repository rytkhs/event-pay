"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { verifyOtpAction as verifyOtpActionImpl } from "@features/auth/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

import { formDataToObject } from "./_shared/form-data";
import { projectAuthCommandResult } from "./_shared/result-projection";

/**
 * OTP検証
 */
export async function verifyOtpAction(formData: FormData): Promise<ActionResult> {
  ensureFeaturesRegistered();

  const result = await verifyOtpActionImpl({
    rawData: formDataToObject(formData),
  });

  return projectAuthCommandResult(result).actionResult;
}
