import { createClient } from '@/lib/supabase/server'
import { Database } from '@/types/database'
import { logger } from '@/lib/logging/app-logger'
import {
  SettlementReportData,
  SettlementReportCsvRow,
  GenerateSettlementReportParams,
  GetSettlementReportsParams,
  SettlementReportResult,
  CsvExportResult,
  ApplicationFeeAggregation,
  RefundDisputeAggregation,
  RpcSettlementReportRow
} from './types'
import { SupabaseClient } from '@supabase/supabase-js'

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
   * 新規行でバージョン運用（既存レポートは残す）
   */
  async generateSettlementReport(params: GenerateSettlementReportParams): Promise<SettlementReportResult> {
    try {
      const { eventId, organizerId, forceRegenerate = false } = params

      logger.info('Settlement report generation started', {
        tag: 'settlementReportGeneration',
        service: 'SettlementReportService',
        eventId,
        organizerId,
        forceRegenerate
      })

      // 1. イベント情報の取得・検証
      const eventData = await this.getEventData(eventId, organizerId)
      if (!eventData) {
        return {
          success: false,
          error: 'Event not found or access denied'
        }
      }

      // 2. 今日既にレポートが存在するかチェック
      if (!forceRegenerate) {
        const existingReport = await this.getTodaysReport(eventId)
        if (existingReport) {
          logger.info('Settlement report already exists for today', {
            tag: 'settlementReportExists',
            eventId,
            reportId: existingReport.id
          })
          return {
            success: true,
            reportId: existingReport.id,
            alreadyExists: true
          }
        }
      }

      // 3. 各種集計の実行
      const [stripeSales, stripeFee, applicationFeeAgg, refundDispute] = await Promise.all([
        this.aggregateStripeSales(eventId),
        this.aggregateStripeFee(eventId),
        this.aggregateApplicationFees(eventId),
        this.aggregateRefundsAndDisputes(eventId)
      ])

      // 4. 手取り額の計算
      const netPayoutAmount = stripeSales.total - stripeFee - applicationFeeAgg.totalApplicationFeeAmount

      // 5. レポートデータの構築
      const reportData: SettlementReportData = {
        eventId,
        eventTitle: eventData.title,
        eventDate: eventData.date,
        organizerId,
        stripeAccountId: eventData.stripeAccountId,
        transferGroup: `event_${eventId}_payout`,
        generatedAt: new Date(),

        totalStripeSales: stripeSales.total,
        totalStripeFee: stripeFee,
        totalApplicationFee: applicationFeeAgg.totalApplicationFeeAmount,
        netPayoutAmount,

        totalPaymentCount: stripeSales.count,
        refundedCount: refundDispute.refundedCount,
        totalRefundedAmount: refundDispute.totalRefundedAmount,

        settlementMode: 'destination_charge',
        status: 'completed'
      }

      // 6. payouts テーブルに保存
      const { data: savedPayout, error: saveError } = await this.supabase
        .from('payouts')
        .insert({
          event_id: eventId,
          user_id: organizerId,
          total_stripe_sales: reportData.totalStripeSales,
          total_stripe_fee: reportData.totalStripeFee,
          platform_fee: reportData.totalApplicationFee,
          net_payout_amount: reportData.netPayoutAmount,
          stripe_account_id: reportData.stripeAccountId,
          transfer_group: reportData.transferGroup,
          settlement_mode: reportData.settlementMode,
          status: reportData.status,
          generated_at: reportData.generatedAt.toISOString()
        })
        .select('id')
        .single()

      if (saveError) {
        logger.error('Failed to save settlement report', {
          tag: 'settlementReportSaveError',
          eventId,
          error: saveError.message
        })
        return {
          success: false,
          error: `Failed to save settlement report: ${saveError.message}`
        }
      }

      logger.info('Settlement report generated successfully', {
        tag: 'settlementReportGenerated',
        eventId,
        reportId: savedPayout.id,
        netPayoutAmount: reportData.netPayoutAmount
      })

      return {
        success: true,
        reportId: savedPayout.id,
        reportData
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
   */
  async getSettlementReports(params: GetSettlementReportsParams): Promise<SettlementReportData[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'get_settlement_report_details',
        {
          p_organizer_id: params.organizerId,
          p_event_ids: params.eventIds || null,
          p_from_date: params.fromDate?.toISOString() || null,
          p_to_date: params.toDate?.toISOString() || null,
          p_limit: params.limit || 50,
          p_offset: params.offset || 0,
        }
      ) as { data: RpcSettlementReportRow[] | null; error: any }

      if (error) {
        logger.error('Failed to get settlement reports via RPC', {
          tag: 'getSettlementReportsRpcError',
          organizerId: params.organizerId,
          error: error.message,
        })
        throw new Error(`Failed to get settlement reports: ${error.message}`)
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

        settlementMode: row.settlement_mode as any,
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
          filename: `settlement-reports-${new Date().toISOString().split('T')[0]}.csv`
        }
      }

      const csvRows: SettlementReportCsvRow[] = reports.map(report => ({
        eventId: report.eventId,
        eventTitle: report.eventTitle,
        eventDate: report.eventDate,
        generatedAt: report.generatedAt.toISOString(),
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

      // CSV ヘッダー
      const headers = [
        'イベントID', 'イベント名', 'イベント日', 'レポート生成日時',
        '売上合計', 'Stripe手数料', 'プラットフォーム手数料', '手取り額',
        '決済件数', '返金件数', '返金額合計',
        '決済方式', 'Transfer Group', 'Stripe Account ID'
      ]

      // CSV 本体
      const csvLines = [
        headers.join(','),
        ...csvRows.map(row => [
          row.eventId,
          `"${row.eventTitle}"`,
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
        ].join(','))
      ]

      const csvContent = csvLines.join('\n')
      const filename = `settlement-reports-${new Date().toISOString().split('T')[0]}.csv`

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
      organizerId,
      forceRegenerate: true
    })
  }

  // === Private Helper Methods ===

  private async getEventData(eventId: string, organizerId: string) {
    const { data, error } = await this.supabase
      .from('events')
      .select(`
        id,
        title,
        date,
        created_by,
        stripe_connect_accounts!inner (
          stripe_account_id
        )
      `)
      .eq('id', eventId)
      .eq('created_by', organizerId)
      .single()

    if (error || !data) {
      return null
    }

    return {
      id: data.id,
      title: data.title,
      date: data.date,
      stripeAccountId: (data.stripe_connect_accounts as any)?.stripe_account_id || ''
    }
  }

  private async getTodaysReport(eventId: string) {
    const today = new Date()
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const todayEnd = new Date(todayStart)
    todayEnd.setDate(todayEnd.getDate() + 1)

    const { data } = await this.supabase
      .from('payouts')
      .select('id')
      .eq('event_id', eventId)
      .eq('settlement_mode', 'destination_charge')
      .gte('generated_at', todayStart.toISOString())
      .lt('generated_at', todayEnd.toISOString())
      .limit(1)
      .maybeSingle()

    return data
  }

  private async aggregateStripeSales(eventId: string): Promise<{ total: number; count: number }> {
    const { data, error } = await this.supabase
      .from('payments')
      .select(`
        amount,
        attendances!inner (
          event_id
        )
      `)
      .eq('attendances.event_id', eventId)
      .eq('method', 'stripe')
      .eq('status', 'paid')

    if (error) {
      throw new Error(`Failed to aggregate Stripe sales: ${error.message}`)
    }

    const total = (data || []).reduce((sum, payment) => sum + payment.amount, 0)
    const count = data?.length || 0

    return { total, count }
  }

  private async aggregateStripeFee(eventId: string): Promise<number> {
    // 既存の calc_total_stripe_fee RPC を使用
    const { data, error } = await this.supabase
      .rpc('calc_total_stripe_fee', { p_event_id: eventId })

    if (error) {
      throw new Error(`Failed to calculate Stripe fees: ${error.message}`)
    }

    return data || 0
  }

  private async aggregateApplicationFees(eventId: string): Promise<ApplicationFeeAggregation> {
    const { data, error } = await this.supabase
      .from('payments')
      .select(`
        application_fee_amount,
        attendances!inner (
          event_id
        )
      `)
      .eq('attendances.event_id', eventId)
      .eq('method', 'stripe')
      .eq('status', 'paid')

    if (error) {
      throw new Error(`Failed to aggregate application fees: ${error.message}`)
    }

    const payments = data || []
    const totalApplicationFeeAmount = payments.reduce(
      (sum, payment) => sum + (payment.application_fee_amount || 0),
      0
    )
    const paymentCount = payments.length
    const averageFeePerPayment = paymentCount > 0 ? totalApplicationFeeAmount / paymentCount : 0

    return {
      totalApplicationFeeAmount,
      paymentCount,
      averageFeePerPayment
    }
  }

  private async aggregateRefundsAndDisputes(eventId: string): Promise<RefundDisputeAggregation> {
    const { data, error } = await this.supabase
      .from('payments')
      .select(`
        refunded_amount,
        application_fee_refunded_amount,
        attendances!inner (
          event_id
        )
      `)
      .eq('attendances.event_id', eventId)
      .eq('method', 'stripe')
      .gt('refunded_amount', 0)

    if (error) {
      throw new Error(`Failed to aggregate refunds and disputes: ${error.message}`)
    }

    const refunds = data || []
    const totalRefundedAmount = refunds.reduce((sum, payment) => sum + (payment.refunded_amount || 0), 0)
    const totalApplicationFeeRefunded = refunds.reduce(
      (sum, payment) => sum + (payment.application_fee_refunded_amount || 0),
      0
    )
    const refundedCount = refunds.length

    // Dispute は現時点では別途実装が必要（今回は0で返す）
    return {
      totalRefundedAmount,
      refundedCount,
      totalApplicationFeeRefunded,
      totalDisputedAmount: 0,
      disputeCount: 0
    }
  }
}
