"use server";

import {
  adminAddAttendanceAction as adminAddAttendanceActionImpl,
  exportParticipantsCsvAction as exportParticipantsCsvActionImpl,
} from "@features/events/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

type AdminAddAttendanceInput = Parameters<typeof adminAddAttendanceActionImpl>[0];
type ExportParticipantsCsvParams = Parameters<typeof exportParticipantsCsvActionImpl>[0];

export async function adminAddAttendanceAction(input: AdminAddAttendanceInput) {
  ensureFeaturesRegistered();
  return adminAddAttendanceActionImpl(input);
}

export async function exportParticipantsCsvAction(params: ExportParticipantsCsvParams) {
  ensureFeaturesRegistered();
  return exportParticipantsCsvActionImpl(params);
}
