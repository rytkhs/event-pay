"use server";

import { updatePasswordAction as updatePasswordActionImpl } from "@features/settings/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function updatePasswordAction(formData: FormData) {
  ensureFeaturesRegistered();
  return updatePasswordActionImpl(formData);
}
