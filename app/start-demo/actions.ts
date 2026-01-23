"use server";

import { startDemoSession as startDemoSessionImpl } from "@features/demo/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function startDemoSession() {
  ensureFeaturesRegistered();
  return startDemoSessionImpl();
}
