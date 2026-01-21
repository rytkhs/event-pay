"use server";

import { adminAddAttendanceAction as adminAddAttendanceActionImpl } from "@features/events/actions/admin-add-attendance";

import { registerAllFeatures } from "@/app/_init/feature-registrations";

export async function adminAddAttendanceAction(input: unknown) {
  registerAllFeatures();
  return adminAddAttendanceActionImpl(input);
}
