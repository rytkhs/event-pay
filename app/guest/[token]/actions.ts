"use server";

import "@/app/_init/feature-registrations";

import { createGuestStripeSessionAction as createGuestStripeSessionActionImpl } from "@features/guest/actions/create-stripe-session";

export async function createGuestStripeSessionAction(input: unknown) {
  return createGuestStripeSessionActionImpl(input);
}
