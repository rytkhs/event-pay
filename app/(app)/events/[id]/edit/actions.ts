"use server";

import { updateEventAction as updateEventActionImpl } from "@features/events/actions/update-event";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function updateEventAction(eventId: string, formData: FormData) {
  ensureFeaturesRegistered();
  return updateEventActionImpl(eventId, formData);
}
