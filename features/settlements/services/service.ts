import "server-only";

import { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createClient } from "@core/supabase/server";
import { toCsvCell } from "@core/utils/csv";
import { handleServerError } from "@core/utils/error-handler";
import {
  formatDateToJstYmd,
  getCurrentJstTime,
  formatUtcToJst,
  convertJstDateToUtcRange,
} from "@core/utils/timezone";

import { Database } from "@/types/database";

import {
  SettlementReportData,
  SettlementReportCsvRow,
  GenerateSettlementReportParams,
  GetSettlementReportsParams,
  SettlementReportResult,
  RpcSettlementReportRow,
  GenerateSettlementReportRpcRow,
} from "./types";

/**
 * イベント清算レポートサービス
 * Destination charges での集計スナップショット生成・管理
 */
export class SettlementReportService {
  private supabase: SupabaseClient<Database, "public">;

  constructor(supabaseClient?: SupabaseClient<Database, "public">) {
    this.supabase = supabaseClient || createClient();
  }

  /**
   * 構造化ロガー
   */
  private get logger() {
    return logger.withContext({
      category: "settlement",
      action: "settlement_service",
      actor_type: "system",
    });
  }

  /**
   * イベント清算レポートを生成
   * 競合条件を回避するため、PL/pgSQL関数で一括処理
   * 同トランザクションで完全なレポートデータも返却
   */
  async generateSettlementReport(
    params: GenerateSettlementReportParams
  ): Promise<SettlementReportResult> {
    try {
      const { eventId, createdBy } = params;

      this.logger.info("Settlement report generation started (RPC)", {
        service: "SettlementReportService",
        eventId,
        createdBy,
        outcome: "success",
      });

      // RPC関数は管理者（service_role）クライアントで実行（権限整合）
      const factory = SecureSupabaseClientFactory.create();
      const adminClient = await factory.createAuditedAdminClient(
        AdminReason.PAYMENT_PROCESSING,
        "features/settlements/services/service generateSettlementReport"
      );

      const { data, error } = (await adminClient.rpc("generate_settlement_report", {
        input_event_id: eventId,
        input_created_by: createdBy,
      })) as { data: GenerateSettlementReportRpcRow[] | null; error: any };

      // エラーハンドリング
      if (error) {
        handleServerError(error, {
          category: "settlement",
          action: "generate_report_rpc_failed",
          additionalData: { eventId },
        });
        return {
          success: false,
          error: `RPC呼び出しに失敗しました: ${error.message}`,
        };
      }

      // 配列の最初の要素を取得（RPC関数は常に1行を返す）
      const resultRow = data && data.length > 0 ? data[0] : null;

      // 何らかの理由でデータが取得できなかった場合はエラー扱い
      if (!resultRow?.report_id) {
        handleServerError("SETTLEMENT_REPORT_FAILED", {
          category: "settlement",
          action: "generate_report_no_data",
          additionalData: { eventId },
        });
        return {
          success: false,
          error: "レポートデータが取得できませんでした",
        };
      }

      // レスポンスデータを構築
      const reportData: SettlementReportData = {
        eventId: resultRow.returned_event_id,
        eventTitle: resultRow.event_title,
        eventDate: resultRow.event_date,
        createdBy: resultRow.created_by,
        stripeAccountId: resultRow.stripe_account_id,
        transferGroup: resultRow.transfer_group,
        generatedAt: new Date(resultRow.report_generated_at),

        totalStripeSales: resultRow.total_stripe_sales,
        totalStripeFee: resultRow.total_stripe_fee,
        totalApplicationFee: resultRow.total_application_fee,
        netPayoutAmount: resultRow.net_payout_amount,

        totalPaymentCount: resultRow.payment_count,
        refundedCount: resultRow.refunded_count,
        totalRefundedAmount: resultRow.total_refunded_amount,
        disputeCount: resultRow.dispute_count,
        totalDisputedAmount: resultRow.total_disputed_amount,

        // settlementMode と status は削除済み（常に'destination_charge', 'completed'だったため不要）
      };

      const alreadyExists = resultRow.already_exists ?? false;

      this.logger.info("Settlement report generated successfully (RPC)", {
        eventId,
        reportId: resultRow.report_id,
        alreadyExists,
        outcome: "success",
      });

      return {
        success: true,
        reportId: resultRow.report_id,
        reportData,
        alreadyExists,
      };
    } catch (error) {
      handleServerError(error, {
        category: "settlement",
        action: "generate_report_failed",
        additionalData: { eventId: params.eventId },
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 清算レポート一覧を取得（RPC関数使用で動的計算）
   * fromDate/toDateはJST基準の日付範囲をUTCに変換して渡す
   */
  async getSettlementReports(params: GetSettlementReportsParams): Promise<SettlementReportData[]> {
    try {
      // JST基準の日付範囲をUTCに変換
      let fromDateUtc: string | undefined;
      let toDateUtc: string | undefined;

      if (params.fromDate) {
        const fromJstString = formatDateToJstYmd(params.fromDate);
        const { startOfDay } = convertJstDateToUtcRange(fromJstString);
        fromDateUtc = startOfDay.toISOString();
      }

      if (params.toDate) {
        const toJstString = formatDateToJstYmd(params.toDate);
        const { endOfDay } = convertJstDateToUtcRange(toJstString);
        toDateUtc = endOfDay.toISOString();
      }

      const { data, error } = await this.supabase.rpc("get_settlement_report_details", {
        input_created_by: params.createdBy,
        input_event_ids: params.eventIds || undefined,
        p_from_date: fromDateUtc,
        p_to_date: toDateUtc,
        p_limit: params.limit || 50,
        p_offset: params.offset || 0,
      });

      if (error) {
        handleServerError(error, {
          category: "settlement",
          action: "get_reports_rpc_failed",
          userId: params.createdBy,
        });
        throw new Error(`Failed to get settlement reports: ${error?.message || "Unknown error"}`);
      }

      const rows = (data || []).map((row) => ({
        ...row,
        // これらのフィールドがRPCから返されない場合のデフォルト値を設定
        total_disputed_amount: (row as any).total_disputed_amount ?? 0,
        dispute_count: (row as any).dispute_count ?? 0,
      })) as Array<
        RpcSettlementReportRow & {
          total_disputed_amount: number;
          dispute_count: number;
        }
      >;

      return rows.map(
        (row): SettlementReportData => ({
          eventId: row.event_id,
          eventTitle: row.event_title,
          eventDate: row.event_date,
          createdBy: params.createdBy,
          stripeAccountId: row.stripe_account_id ?? "",
          transferGroup: row.transfer_group ?? "",
          generatedAt: new Date(row.generated_at),

          totalStripeSales: row.total_stripe_sales,
          totalStripeFee: row.total_stripe_fee,
          totalApplicationFee: row.total_application_fee,
          netPayoutAmount: row.net_payout_amount,

          totalPaymentCount: row.payment_count,
          refundedCount: row.refunded_count,
          totalRefundedAmount: row.total_refunded_amount,
          disputeCount: row.dispute_count,
          totalDisputedAmount: row.total_disputed_amount,

          // settlementMode と status は削除済み（常に'destination_charge', 'completed'だったため不要）
        })
      );
    } catch (error) {
      handleServerError(error, {
        category: "settlement",
        action: "get_reports_failed",
        userId: params.createdBy,
      });
      throw error;
    }
  }

  /**
   * CSV エクスポート
   */
  async exportToCsv(params: GetSettlementReportsParams): Promise<{
    success: boolean;
    csvContent?: string;
    filename?: string;
    truncated?: boolean;
    error?: string;
  }> {
    try {
      // 1,001 件取得して切り捨て判定
      const limit = params.limit && params.limit > 0 ? params.limit : 1000;
      const overfetchParams: GetSettlementReportsParams = { ...params, limit: limit + 1 };
      const reports = await this.getSettlementReports(overfetchParams);

      if (reports.length === 0) {
        return {
          success: true,
          csvContent: "",
          filename: `settlement-reports-${formatDateToJstYmd(getCurrentJstTime())}.csv`,
          truncated: false,
        };
      }

      const truncated = reports.length > limit;
      const exportSource = truncated ? reports.slice(0, limit) : reports;

      const csvRows: SettlementReportCsvRow[] = exportSource.map((report) => ({
        eventId: report.eventId,
        eventTitle: report.eventTitle,
        eventDate: report.eventDate,
        generatedAt: formatUtcToJst(report.generatedAt, "yyyy-MM-dd HH:mm:ss"),
        totalStripeSales: report.totalStripeSales,
        totalStripeFee: report.totalStripeFee,
        totalApplicationFee: report.totalApplicationFee,
        netPayoutAmount: report.netPayoutAmount,
        totalPaymentCount: report.totalPaymentCount,
        refundedCount: report.refundedCount,
        totalRefundedAmount: report.totalRefundedAmount,
        disputeCount: report.disputeCount,
        totalDisputedAmount: report.totalDisputedAmount,
        settlementMode: "destination_charge",
        transferGroup: report.transferGroup,
        stripeAccountId: report.stripeAccountId,
      }));

      // CSV ヘッダー（常にダブルクォートで囲む）
      const headers = [
        "イベントID",
        "イベント名",
        "イベント日",
        "レポート生成日時",
        "売上合計",
        "Stripe手数料",
        "プラットフォーム手数料",
        "手取り額",
        "決済件数",
        "返金件数",
        "返金額合計",
        "Dispute件数",
        "Dispute金額合計",
        "決済方式",
        "Transfer Group",
        "Stripe Account ID",
      ];

      const csvLines = [
        headers.map(toCsvCell).join(","),
        ...csvRows.map((row) =>
          [
            row.eventId,
            row.eventTitle,
            row.eventDate,
            row.generatedAt,
            row.totalStripeSales,
            row.totalStripeFee,
            row.totalApplicationFee,
            row.netPayoutAmount,
            row.totalPaymentCount,
            row.refundedCount,
            row.totalRefundedAmount,
            row.disputeCount,
            row.totalDisputedAmount,
            row.settlementMode,
            row.transferGroup,
            row.stripeAccountId,
          ]
            .map(toCsvCell)
            .join(",")
        ),
      ];

      const csvContent = csvLines.join("\n");
      const filename = `settlement-reports-${formatDateToJstYmd(getCurrentJstTime())}.csv`;

      return {
        success: true,
        csvContent,
        filename,
        truncated,
      };
    } catch (error) {
      handleServerError(error, {
        category: "settlement",
        action: "export_csv_failed",
        userId: params.createdBy,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * 返金・Dispute時の再集計
   */
  async regenerateAfterRefundOrDispute(
    eventId: string,
    createdBy: string
  ): Promise<SettlementReportResult> {
    this.logger.info("Regenerating settlement report after refund/dispute", {
      eventId,
      createdBy,
      outcome: "success",
    });

    return this.generateSettlementReport({
      eventId,
      createdBy,
    });
  }
}
