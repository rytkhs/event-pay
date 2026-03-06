"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { logoutAction as logoutActionImpl } from "@features/auth/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

import { trackAuthEvent } from "./_shared/auth-telemetry";
import { projectAuthCommandResult } from "./_shared/result-projection";

/**
 * ログアウト
 */
export async function logoutAction(): Promise<ActionResult> {
  ensureFeaturesRegistered();

  const result = await logoutActionImpl();
  const { actionResult, sideEffects } = projectAuthCommandResult(result);

  if (sideEffects?.telemetry) {
    trackAuthEvent(sideEffects.telemetry);
  }

  return actionResult;
}
