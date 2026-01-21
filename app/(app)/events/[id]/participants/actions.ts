"use server";

import "@/app/_init/feature-registrations";

import { adminAddAttendanceAction as adminAddAttendanceActionImpl } from "@features/events/actions/admin-add-attendance";

export async function adminAddAttendanceAction(input: unknown) {
  return adminAddAttendanceActionImpl(input);
}
