"use server";

import {
  exportSettlementReportsAction as exportSettlementReportsActionImpl,
  generateSettlementReportAction as generateSettlementReportActionImpl,
  getSettlementReportsAction as getSettlementReportsActionImpl,
  regenerateAfterRefundAction as regenerateAfterRefundActionImpl,
} from "@features/settlements/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

type GenerateSettlementReportInput = Parameters<typeof generateSettlementReportActionImpl>[0];
type GetSettlementReportsInput = Parameters<typeof getSettlementReportsActionImpl>[0];
type ExportSettlementReportsInput = Parameters<typeof exportSettlementReportsActionImpl>[0];
type RegenerateAfterRefundInput = Parameters<typeof regenerateAfterRefundActionImpl>[0];

export async function generateSettlementReportAction(input: GenerateSettlementReportInput) {
  ensureFeaturesRegistered();
  return generateSettlementReportActionImpl(input);
}

export async function getSettlementReportsAction(input: GetSettlementReportsInput) {
  ensureFeaturesRegistered();
  return getSettlementReportsActionImpl(input);
}

export async function exportSettlementReportsAction(input: ExportSettlementReportsInput) {
  ensureFeaturesRegistered();
  return exportSettlementReportsActionImpl(input);
}

export async function regenerateAfterRefundAction(input: RegenerateAfterRefundInput) {
  ensureFeaturesRegistered();
  return regenerateAfterRefundActionImpl(input);
}
