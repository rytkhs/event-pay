"use server";

import { adminAddAttendanceAction as adminAddAttendanceActionImpl } from "@features/events/actions/admin-add-attendance";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export async function adminAddAttendanceAction(input: unknown) {
  ensureFeaturesRegistered();
  return adminAddAttendanceActionImpl(input);
}
