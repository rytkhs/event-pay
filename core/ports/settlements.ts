/**
 * Settlement Report Port Interface
 * Core層からSettlement機能にアクセスするためのポートインターフェース
 */

export interface SettlementReportPort {
  regenerateAfterRefundOrDispute(
    eventId: string,
    createdBy: string
  ): Promise<{
    success: boolean;
    error?: string;
    reportId?: string;
  }>;
}

// Port Registration System
let settlementPort: SettlementReportPort | null = null;

export function registerSettlementReportPort(impl: SettlementReportPort): void {
  settlementPort = impl;
}

export function getSettlementReportPort(): SettlementReportPort {
  if (!settlementPort) {
    throw new Error(
      "SettlementReportPort not registered. Please register settlement adapters first."
    );
  }
  return settlementPort;
}

export function isSettlementReportPortRegistered(): boolean {
  return settlementPort !== null;
}
