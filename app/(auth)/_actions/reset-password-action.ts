"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { resetPasswordAction as resetPasswordActionImpl } from "@features/auth/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

import { getRequestIp } from "./_shared/request-context";
import { projectAuthCommandResult } from "./_shared/result-projection";
import { formDataToObject } from "./_shared/form-data";

/**
 * パスワードリセット要求
 */
export async function resetPasswordAction(formData: FormData): Promise<ActionResult> {
  ensureFeaturesRegistered();

  const result = await resetPasswordActionImpl({
    rawData: formDataToObject(formData),
    requestContext: {
      ip: await getRequestIp(),
    },
  });

  return projectAuthCommandResult(result).actionResult;
}
