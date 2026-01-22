"use server";

import { createGuestStripeSessionAction as createGuestStripeSessionActionImpl } from "@features/guest/actions/create-stripe-session";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function createGuestStripeSessionAction(input: unknown) {
  ensureFeaturesRegistered();
  return createGuestStripeSessionActionImpl(input);
}
