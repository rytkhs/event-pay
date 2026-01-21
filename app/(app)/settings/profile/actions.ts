"use server";

import "@/app/_init/feature-registrations";

import { requestAccountDeletionAction as requestAccountDeletionActionImpl } from "@features/settings/actions/request-account-deletion";

export async function requestAccountDeletionAction(formData: FormData) {
  return requestAccountDeletionActionImpl(formData);
}
