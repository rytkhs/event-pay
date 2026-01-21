"use server";

import { createGuestStripeSessionAction as createGuestStripeSessionActionImpl } from "@features/guest/actions/create-stripe-session";

import { registerAllFeatures } from "@/app/_init/feature-registrations";

export async function createGuestStripeSessionAction(input: unknown) {
  registerAllFeatures();
  return createGuestStripeSessionActionImpl(input);
}
