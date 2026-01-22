"use server";

import { requestAccountDeletionAction as requestAccountDeletionActionImpl } from "@features/settings/actions/request-account-deletion";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function requestAccountDeletionAction(formData: FormData) {
  ensureFeaturesRegistered();
  return requestAccountDeletionActionImpl(formData);
}
