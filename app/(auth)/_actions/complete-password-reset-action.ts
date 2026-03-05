"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { completePasswordResetAction as completePasswordResetActionImpl } from "@features/auth/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

import { projectAuthCommandResult } from "./_shared/result-projection";
import { formDataToObject } from "./_shared/form-data";

/**
 * パスワード更新（リセット後）
 */
export async function completePasswordResetAction(formData: FormData): Promise<ActionResult> {
  ensureFeaturesRegistered();

  const result = await completePasswordResetActionImpl({
    rawData: formDataToObject(formData),
  });

  return projectAuthCommandResult(result).actionResult;
}
