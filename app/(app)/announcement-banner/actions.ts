"use server";

import { dismissPayoutRequestInAppBannerCookie } from "@core/announcements/app-banner";
import { type ActionResult, ok } from "@core/errors/adapters/server-actions";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function dismissPayoutRequestInAppBannerAction(): Promise<ActionResult> {
  ensureFeaturesRegistered();
  await dismissPayoutRequestInAppBannerCookie();
  return ok();
}
