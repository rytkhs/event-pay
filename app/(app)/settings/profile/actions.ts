"use server";

import {
  requestAccountDeletionAction as requestAccountDeletionActionImpl,
  updateEmailAction as updateEmailActionImpl,
  updateProfileAction as updateProfileActionImpl,
} from "@features/settings/server";

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
