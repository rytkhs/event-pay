"use server";

import { requestAccountDeletionAction as requestAccountDeletionActionImpl } from "@features/settings/actions/request-account-deletion";

import { registerAllFeatures } from "@/app/_init/feature-registrations";

export async function requestAccountDeletionAction(formData: FormData) {
  registerAllFeatures();
  return requestAccountDeletionActionImpl(formData);
}
