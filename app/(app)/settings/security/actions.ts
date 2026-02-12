"use server";

import { changePasswordAction as changePasswordActionImpl } from "@features/settings/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function changePasswordAction(formData: FormData) {
  ensureFeaturesRegistered();
  return changePasswordActionImpl(formData);
}
