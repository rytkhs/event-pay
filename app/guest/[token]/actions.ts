"use server";

import { getHeaders } from "@core/utils/next";

import {
  createGuestStripeSessionAction as createGuestStripeSessionActionImpl,
  type GuestRequestSecurityContext,
  updateGuestAttendanceAction as updateGuestAttendanceActionImpl,
} from "@features/guest/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function createGuestStripeSessionAction(input: unknown) {
  ensureFeaturesRegistered();
  return createGuestStripeSessionActionImpl(input);
}

export async function updateGuestAttendanceAction(formData: FormData) {
  ensureFeaturesRegistered();

  let securityContext: GuestRequestSecurityContext = {};
  try {
    securityContext = (await getHeaders()).context;
  } catch {
    // 監査情報は補助情報のため、取得不能でも出欠更新自体は継続する。
  }

  return updateGuestAttendanceActionImpl(formData, securityContext);
}
