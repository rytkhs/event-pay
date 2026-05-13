"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import {
  createExpressDashboardLoginLinkAction as createExpressDashboardLoginLinkActionImpl,
  requestPayoutAction as requestPayoutActionImpl,
  startOnboardingAction as startOnboardingActionImpl,
} from "@features/stripe-connect/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

type StartOnboardingPayload = Record<string, never>;

type StartOnboardingActionResult = ActionResult<StartOnboardingPayload>;

export async function startOnboardingAction(
  formData: FormData
): Promise<StartOnboardingActionResult>;
export async function startOnboardingAction(
  _state: StartOnboardingActionResult,
  formData: FormData
): Promise<StartOnboardingActionResult>;
export async function startOnboardingAction(
  stateOrFormData: StartOnboardingActionResult | FormData,
  maybeFormData?: FormData
): Promise<StartOnboardingActionResult> {
  ensureFeaturesRegistered();
  if (stateOrFormData instanceof FormData) {
    return await startOnboardingActionImpl(stateOrFormData);
  }

  if (!(maybeFormData instanceof FormData)) {
    throw new TypeError("FormData is required");
  }

  return await startOnboardingActionImpl(stateOrFormData, maybeFormData);
}

export async function createExpressDashboardLoginLinkAction() {
  ensureFeaturesRegistered();
  return createExpressDashboardLoginLinkActionImpl();
}

export async function requestPayoutAction() {
  ensureFeaturesRegistered();
  return requestPayoutActionImpl();
}
