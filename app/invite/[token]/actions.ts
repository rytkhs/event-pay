"use server";

import {
  dismissInviteSuccessAction as dismissInviteSuccessActionImpl,
  registerParticipationAction as registerParticipationActionImpl,
} from "@features/invite/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function registerParticipationAction(formData: FormData) {
  ensureFeaturesRegistered();
  return registerParticipationActionImpl(formData);
}

export async function dismissInviteSuccessAction(inviteToken: string) {
  ensureFeaturesRegistered();
  return dismissInviteSuccessActionImpl(inviteToken);
}
