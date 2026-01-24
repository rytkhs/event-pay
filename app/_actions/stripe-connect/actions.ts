"use server";

import {
  createExpressDashboardLoginLinkAction as createExpressDashboardLoginLinkActionImpl,
  startOnboardingAction as startOnboardingActionImpl,
} from "@features/stripe-connect/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function startOnboardingAction() {
  ensureFeaturesRegistered();
  return startOnboardingActionImpl();
}

export async function createExpressDashboardLoginLinkAction() {
  ensureFeaturesRegistered();
  return createExpressDashboardLoginLinkActionImpl();
}
