import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { logger } from '@/lib/logging/app-logger'
import { toCsvCell } from '@/lib/utils/csv'
import {
  SettlementReportData,
  SettlementReportCsvRow,
  GenerateSettlementReportParams,
  GetSettlementReportsParams,
  SettlementReportResult,
  CsvExportResult,
  RpcSettlementReportRow,
  GenerateSettlementReportRpcRow
} from './types'
import { SupabaseClient } from '@supabase/supabase-js'
import { formatDateToJstYmd, getCurrentJstTime, formatUtcToJst, convertJstDateToUtcRange } from '@/lib/utils/timezone'

/**
 * イベント清算レポートサービス
 * Destination charges での集計スナップショット生成・管理
 */
export class SettlementReportService {
  private supabase: SupabaseClient<Database>

  constructor(supabaseClient?: SupabaseClient<Database>) {
    this.supabase = supabaseClient || createClient()
  }

  /**
   * イベント清算レポートを生成
   * 競合条件を回避するため、PL/pgSQL関数で一括処理
   * 同トランザクションで完全なレポートデータも返却
   */
  async generateSettlementReport(params: GenerateSettlementReportParams): Promise<SettlementReportResult> {
    try {
      const { eventId, organizerId } = params

      logger.info('Settlement report generation started (RPC)', {
        tag: 'settlementReportGeneration',
        service: 'SettlementReportService',
        eventId,
        organizerId
      })

      // RPC関数を直接呼び出し（競合条件を回避＋完全データ取得）
      const { data, error } = await this.supabase
        .rpc('generate_settlement_report', {
          p_event_id: eventId,
          p_organizer_id: organizerId,
        })
        .single<GenerateSettlementReportRpcRow>()

      // エラーハンドリング
      if (error) {
        logger.error('RPC settlement report generation failed', {
          tag: 'settlementReportRpcError',
          eventId,
          error: error.message,
        })
        return {
          success: false,
          error: `RPC呼び出しに失敗しました: ${error.message}`,
        }
      }

      // 何らかの理由でデータが取得できなかった場合はエラー扱い
      if (!data?.report_id) {
        logger.error('RPC returned no data', {
          tag: 'settlementReportRpcNoData',
          eventId,
        })
        return {
          success: false,
          error: 'レポートデータが取得できませんでした',
        }
      }

      // レスポンスデータを構築
      const reportData: SettlementReportData = {
        eventId: data.event_id,
        eventTitle: data.event_title,
        eventDate: data.event_date,
        organizerId: data.organizer_id,
        stripeAccountId: data.stripe_account_id,
        transferGroup: data.transfer_group,
        generatedAt: new Date(data.generated_at),

        totalStripeSales: data.total_stripe_sales,
        totalStripeFee: data.total_stripe_fee,
        totalApplicationFee: data.total_application_fee,
        netPayoutAmount: data.net_payout_amount,

        totalPaymentCount: data.payment_count,
        refundedCount: data.refunded_count,
        totalRefundedAmount: data.total_refunded_amount,

        settlementMode: data.settlement_mode as 'destination_charge',
        status: 'completed',
      }

      const alreadyExists = data.already_exists ?? false;

      logger.info('Settlement report generated successfully (RPC)', {
        tag: 'settlementReportGenerated',
        eventId,
        reportId: data.report_id,
        alreadyExists
      })

      return {
        success: true,
        reportId: data.report_id,
        reportData,
        alreadyExists
      }

    } catch (error) {
      logger.error('Settlement report generation failed', {
        tag: 'settlementReportGenerationError',
        eventId: params.eventId,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 清算レポート一覧を取得（RPC関数使用で動的計算）
   * fromDate/toDateはJST基準の日付範囲をUTCに変換して渡す
   */
  async getSettlementReports(params: GetSettlementReportsParams): Promise<SettlementReportData[]> {
    try {
      // JST基準の日付範囲をUTCに変換
      let fromDateUtc: string | undefined
      let toDateUtc: string | undefined

      if (params.fromDate) {
        const fromJstString = formatDateToJstYmd(params.fromDate)
        const { startOfDay } = convertJstDateToUtcRange(fromJstString)
        fromDateUtc = startOfDay.toISOString()
      }

      if (params.toDate) {
        const toJstString = formatDateToJstYmd(params.toDate)
        const { endOfDay } = convertJstDateToUtcRange(toJstString)
        toDateUtc = endOfDay.toISOString()
      }

      const { data, error } = await this.supabase.rpc(
        'get_settlement_report_details',
        {
          p_organizer_id: params.organizerId,
          p_event_ids: params.eventIds || undefined,
          p_from_date: fromDateUtc,
          p_to_date: toDateUtc,
          p_limit: params.limit || 50,
          p_offset: params.offset || 0,
        }
      ) as { data: RpcSettlementReportRow[] | null; error: Error | null }

      if (error) {
        logger.error('Failed to get settlement reports via RPC', {
          tag: 'getSettlementReportsRpcError',
          organizerId: params.organizerId,
          error: error?.message || 'Unknown error',
        })
        throw new Error(`Failed to get settlement reports: ${error?.message || 'Unknown error'}`)
      }

      const rows: RpcSettlementReportRow[] = data || []

      return rows.map((row): SettlementReportData => ({
        eventId: row.event_id,
        eventTitle: row.event_title,
        eventDate: row.event_date,
        organizerId: params.organizerId,
        stripeAccountId: row.stripe_account_id ?? '',
        transferGroup: row.transfer_group ?? '',
        generatedAt: new Date(row.generated_at),

        totalStripeSales: row.total_stripe_sales,
        totalStripeFee: row.total_stripe_fee,
        totalApplicationFee: row.total_application_fee,
        netPayoutAmount: row.net_payout_amount,

        totalPaymentCount: row.payment_count,
        refundedCount: row.refunded_count,
        totalRefundedAmount: row.total_refunded_amount,

        settlementMode: row.settlement_mode,
        status: 'completed',
      }))
    } catch (error) {
      logger.error('Settlement reports RPC call failed', {
        tag: 'getSettlementReportsRpcError',
        organizerId: params.organizerId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * CSV エクスポート
   */
  async exportToCsv(params: GetSettlementReportsParams): Promise<CsvExportResult> {
    try {
      const reports = await this.getSettlementReports(params)

      if (reports.length === 0) {
        return {
          success: true,
          csvContent: '',
          filename: `settlement-reports-${formatDateToJstYmd(getCurrentJstTime())}.csv`
        }
      }

      const csvRows: SettlementReportCsvRow[] = reports.map(report => ({
        eventId: report.eventId,
        eventTitle: report.eventTitle,
        eventDate: report.eventDate,
        generatedAt: formatUtcToJst(report.generatedAt, 'yyyy-MM-dd HH:mm:ss'),
        totalStripeSales: report.totalStripeSales,
        totalStripeFee: report.totalStripeFee,
        totalApplicationFee: report.totalApplicationFee,
        netPayoutAmount: report.netPayoutAmount,
        totalPaymentCount: report.totalPaymentCount,
        refundedCount: report.refundedCount,
        totalRefundedAmount: report.totalRefundedAmount,
        settlementMode: report.settlementMode,
        transferGroup: report.transferGroup,
        stripeAccountId: report.stripeAccountId
      }))

      // CSV ヘッダー（常にダブルクォートで囲む）
      const headers = [
        'イベントID',
        'イベント名',
        'イベント日',
        'レポート生成日時',
        '売上合計',
        'Stripe手数料',
        'プラットフォーム手数料',
        '手取り額',
        '決済件数',
        '返金件数',
        '返金額合計',
        '決済方式',
        'Transfer Group',
        'Stripe Account ID'
      ]

      const csvLines = [
        headers.map(toCsvCell).join(','),
        ...csvRows.map(row => [
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
          row.settlementMode,
          row.transferGroup,
          row.stripeAccountId
        ].map(toCsvCell).join(','))
      ]

      const csvContent = csvLines.join('\n')
      const filename = `settlement-reports-${formatDateToJstYmd(getCurrentJstTime())}.csv`

      return {
        success: true,
        csvContent,
        filename
      }

    } catch (error) {
      logger.error('CSV export failed', {
        tag: 'csvExportError',
        organizerId: params.organizerId,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * 返金・Dispute時の再集計
   */
  async regenerateAfterRefundOrDispute(eventId: string, organizerId: string): Promise<SettlementReportResult> {
    logger.info('Regenerating settlement report after refund/dispute', {
      tag: 'settlementReportRegeneration',
      eventId,
      organizerId
    })

    return this.generateSettlementReport({
      eventId,
      organizerId
    })
  }

}
