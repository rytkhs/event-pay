"use server";

import {
  createGuestStripeSessionAction as createGuestStripeSessionActionImpl,
  updateGuestAttendanceAction as updateGuestAttendanceActionImpl,
} from "@features/guest/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function createGuestStripeSessionAction(input: unknown) {
  ensureFeaturesRegistered();
  return createGuestStripeSessionActionImpl(input);
}

export async function updateGuestAttendanceAction(formData: FormData) {
  ensureFeaturesRegistered();
  return updateGuestAttendanceActionImpl(formData);
}
