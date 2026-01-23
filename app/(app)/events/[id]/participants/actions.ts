"use server";

import {
  adminAddAttendanceAction as adminAddAttendanceActionImpl,
  exportParticipantsCsvAction as exportParticipantsCsvActionImpl,
} from "@features/events/server";
import {
  bulkUpdateCashStatusAction as bulkUpdateCashStatusActionImpl,
  updateCashStatusAction as updateCashStatusActionImpl,
} from "@features/payments/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

type AdminAddAttendanceInput = Parameters<typeof adminAddAttendanceActionImpl>[0];
type ExportParticipantsCsvParams = Parameters<typeof exportParticipantsCsvActionImpl>[0];
type UpdateCashStatusInput = Parameters<typeof updateCashStatusActionImpl>[0];
type BulkUpdateCashStatusInput = Parameters<typeof bulkUpdateCashStatusActionImpl>[0];

export async function adminAddAttendanceAction(input: AdminAddAttendanceInput) {
  ensureFeaturesRegistered();
  return adminAddAttendanceActionImpl(input);
}

export async function exportParticipantsCsvAction(params: ExportParticipantsCsvParams) {
  ensureFeaturesRegistered();
  return exportParticipantsCsvActionImpl(params);
}

export async function updateCashStatusAction(input: UpdateCashStatusInput) {
  ensureFeaturesRegistered();
  return updateCashStatusActionImpl(input);
}

export async function bulkUpdateCashStatusAction(input: BulkUpdateCashStatusInput) {
  ensureFeaturesRegistered();
  return bulkUpdateCashStatusActionImpl(input);
}
