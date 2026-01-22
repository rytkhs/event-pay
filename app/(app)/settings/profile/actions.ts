"use server";

import { requestAccountDeletionAction as requestAccountDeletionActionImpl } from "@features/settings/actions/request-account-deletion";
import { updateEmailAction as updateEmailActionImpl } from "@features/settings/actions/update-email";
import { updateProfileAction as updateProfileActionImpl } from "@features/settings/actions/update-profile";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function requestAccountDeletionAction(formData: FormData) {
  ensureFeaturesRegistered();
  return requestAccountDeletionActionImpl(formData);
}

export async function updateProfileAction(formData: FormData) {
  ensureFeaturesRegistered();
  return updateProfileActionImpl(formData);
}

export async function updateEmailAction(formData: FormData) {
  ensureFeaturesRegistered();
  return updateEmailActionImpl(formData);
}
