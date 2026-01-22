"use server";

import { registerParticipationAction as registerParticipationActionImpl } from "@features/invite/actions/register-participation";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function registerParticipationAction(formData: FormData) {
  ensureFeaturesRegistered();
  return registerParticipationActionImpl(formData);
}
