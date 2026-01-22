"use server";

import { updatePasswordAction as updatePasswordActionImpl } from "@features/settings/actions/update-password";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function updatePasswordAction(formData: FormData) {
  ensureFeaturesRegistered();
  return updatePasswordActionImpl(formData);
}
