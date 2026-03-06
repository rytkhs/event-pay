"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { loginAction as loginActionImpl } from "@features/auth/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

import { trackAuthEvent } from "./_shared/auth-telemetry";
import { formDataToObject } from "./_shared/form-data";
import { getRequestIp } from "./_shared/request-context";
import { projectAuthCommandResult } from "./_shared/result-projection";

/**
 * ログイン
 */
export async function loginAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  ensureFeaturesRegistered();

  const result = await loginActionImpl({
    rawData: formDataToObject(formData),
    requestContext: {
      ip: await getRequestIp(),
    },
  });

  const { actionResult, sideEffects } = projectAuthCommandResult(result);

  if (sideEffects?.telemetry) {
    trackAuthEvent(sideEffects.telemetry);
  }

  return actionResult;
}
