import { Database } from "@/types/database";

// SettlementMode は削除済み（常に'destination_charge'だったため不要）
type SettlementMode = "destination_charge";

/**
 * イベント清算レポートの基本情報
 */
export interface SettlementReportData {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  createdBy: string;
  stripeAccountId: string;
  transferGroup: string;
  generatedAt: Date;

  // 金額集計
  totalStripeSales: number; // Stripe決済の売上合計
  totalStripeFee: number; // Stripe手数料合計
  totalApplicationFee: number; // プラットフォーム手数料合計
  netPayoutAmount: number; // 手取り額（売上 - Stripe手数料 - プラットフォーム手数料）

  // 件数集計
  totalPaymentCount: number; // 総決済件数（Stripe）
  refundedCount: number; // 返金件数
  totalRefundedAmount: number; // 返金額合計
  disputeCount: number; // Dispute件数
  totalDisputedAmount: number; // Dispute金額合計

  // 設定
  // settlementMode は削除済み（常に'destination_charge'だったため不要）
  // status は削除済み（常に'completed'だったため不要）
}

/**
 * CSV エクスポート用のカラム定義
 */
export interface SettlementReportCsvRow {
  // イベント情報
  eventId: string;
  eventTitle: string;
  eventDate: string;
  generatedAt: string;

  // 売上・手数料・手取り
  totalStripeSales: number;
  totalStripeFee: number;
  totalApplicationFee: number;
  netPayoutAmount: number;

  // 件数
  totalPaymentCount: number;
  refundedCount: number;
  totalRefundedAmount: number;
  disputeCount: number;
  totalDisputedAmount: number;

  // メタデータ
  settlementMode: string;
  transferGroup: string;
  stripeAccountId: string;
}

/**
 * レポート生成パラメータ
 */
export interface GenerateSettlementReportParams {
  eventId: string;
  createdBy: string;
}

/**
 * レポート検索パラメータ
 */
export interface GetSettlementReportsParams {
  createdBy: string;
  eventIds?: string[];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * レポート生成結果
 */
export interface SettlementReportResult {
  success: boolean;
  reportId?: string;
  reportData?: SettlementReportData;
  error?: string;
  alreadyExists?: boolean;
}

/**
 * CSV エクスポート結果
 * Note: 実際の使用はapp/actions/settlement-report-actions.tsの型定義を参照
 */

export interface RpcSettlementReportRow {
  event_id: string;
  event_title: string;
  event_date: string;
  stripe_account_id: string | null;
  transfer_group: string | null;
  generated_at: string;
  total_stripe_sales: number;
  total_stripe_fee: number;
  total_application_fee: number;
  total_disputed_amount?: number;
  dispute_count?: number;
  net_payout_amount: number;
  payment_count: number;
  refunded_count: number;
  total_refunded_amount: number;
  // settlement_mode と status は削除済み（常に'destination_charge', 'completed'だったため不要）
}

/**
 * generate_settlement_report RPC の戻り値型
 */
export interface GenerateSettlementReportRpcRow {
  report_id: string;
  already_exists: boolean;
  returned_event_id: string;
  event_title: string;
  event_date: string;
  created_by: string;
  stripe_account_id: string;
  transfer_group: string;
  total_stripe_sales: number;
  total_stripe_fee: number;
  total_application_fee: number;
  net_payout_amount: number;
  payment_count: number;
  refunded_count: number;
  total_refunded_amount: number;
  dispute_count: number;
  total_disputed_amount: number;
  settlement_mode: string;
  report_generated_at: string;
  report_updated_at: string;
}
