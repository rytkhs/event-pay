"use server";

import { createEventAction as createEventActionImpl } from "@features/events/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function createEventAction(formData: FormData) {
  ensureFeaturesRegistered();
  return createEventActionImpl(formData);
}
