'use server'

import { createClient } from '@/lib/supabase/server'
import { SettlementReportService } from '@/lib/services/settlement-report/service'
import { logger } from '@/lib/logging/app-logger'
import { getCurrentUser } from '@/lib/auth/auth-utils'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// バリデーションスキーマ
const generateReportSchema = z.object({
  eventId: z.string().uuid(),
  forceRegenerate: z.boolean().optional().default(false)
})

const getReportsSchema = z.object({
  eventIds: z.array(z.string().uuid()).optional(),
  fromDate: z.string().datetime().optional(),
  toDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0)
})

/**
 * イベント清算レポートを生成
 */
export async function generateSettlementReportAction(formData: FormData) {
  try {
    // 認証確認
    const user = await getCurrentUser()
    if (!user?.id) {
      redirect('/login')
    }

    // 入力値検証
    const rawData = {
      eventId: formData.get('eventId')?.toString() || '',
      forceRegenerate: formData.get('forceRegenerate') === 'true'
    }

    const validatedData = generateReportSchema.parse(rawData)

    // サービス実行
    const supabase = createClient()
    const service = new SettlementReportService(supabase)

    const result = await service.generateSettlementReport({
      eventId: validatedData.eventId,
      organizerId: user.id,
      forceRegenerate: validatedData.forceRegenerate
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'レポート生成に失敗しました'
      }
    }

    logger.info('Settlement report generated via action', {
      tag: 'settlementReportAction',
      userId: user.id,
      eventId: validatedData.eventId,
      reportId: result.reportId,
      alreadyExists: result.alreadyExists
    })

    return {
      success: true,
      reportId: result.reportId,
      alreadyExists: result.alreadyExists,
      reportData: result.reportData
    }

  } catch (error) {
    logger.error('Settlement report generation action failed', {
      tag: 'settlementReportActionError',
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }
  }
}

/**
 * 清算レポート一覧を取得
 */
export async function getSettlementReportsAction(params: {
  eventIds?: string[]
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}) {
  try {
    // 認証確認
    const user = await getCurrentUser()
    if (!user?.id) {
      redirect('/login')
    }

    // 入力値検証
    const validatedParams = getReportsSchema.parse(params)

    // サービス実行
    const supabase = createClient()
    const service = new SettlementReportService(supabase)

    const reports = await service.getSettlementReports({
      organizerId: user.id,
      eventIds: validatedParams.eventIds,
      fromDate: validatedParams.fromDate ? new Date(validatedParams.fromDate) : undefined,
      toDate: validatedParams.toDate ? new Date(validatedParams.toDate) : undefined,
      limit: validatedParams.limit,
      offset: validatedParams.offset
    })

    return {
      success: true,
      reports
    }

  } catch (error) {
    logger.error('Get settlement reports action failed', {
      tag: 'getSettlementReportsActionError',
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました',
      reports: []
    }
  }
}

/**
 * CSV エクスポート
 */
export async function exportSettlementReportsAction(params: {
  eventIds?: string[]
  fromDate?: string
  toDate?: string
}) {
  try {
    // 認証確認
    const user = await getCurrentUser()
    if (!user?.id) {
      redirect('/login')
    }

    // 入力値検証
    const validatedParams = getReportsSchema.parse({ ...params, limit: 1000 }) // CSVは最大1000件

    // サービス実行
    const supabase = createClient()
    const service = new SettlementReportService(supabase)

    const result = await service.exportToCsv({
      organizerId: user.id,
      eventIds: validatedParams.eventIds,
      fromDate: validatedParams.fromDate ? new Date(validatedParams.fromDate) : undefined,
      toDate: validatedParams.toDate ? new Date(validatedParams.toDate) : undefined,
      limit: 1000
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'CSV エクスポートに失敗しました'
      }
    }

    logger.info('Settlement reports CSV export completed', {
      tag: 'settlementReportsCsvExport',
      userId: user.id,
      filename: result.filename
    })

    return {
      success: true,
      csvContent: result.csvContent,
      filename: result.filename
    }

  } catch (error) {
    logger.error('Settlement reports CSV export action failed', {
      tag: 'settlementReportsCsvExportActionError',
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }
  }
}

/**
 * 返金・Dispute時の再集計
 */
export async function regenerateAfterRefundAction(formData: FormData) {
  try {
    // 認証確認
    const user = await getCurrentUser()
    if (!user?.id) {
      redirect('/login')
    }

    // 入力値検証
    const rawData = {
      eventId: formData.get('eventId')?.toString() || ''
    }

    const validatedData = generateReportSchema.parse({ ...rawData, forceRegenerate: true })

    // サービス実行
    const supabase = createClient()
    const service = new SettlementReportService(supabase)

    const result = await service.regenerateAfterRefundOrDispute(
      validatedData.eventId,
      user.id
    )

    if (!result.success) {
      return {
        success: false,
        error: result.error || '再集計に失敗しました'
      }
    }

    logger.info('Settlement report regenerated after refund/dispute', {
      tag: 'settlementReportRegeneration',
      userId: user.id,
      eventId: validatedData.eventId,
      reportId: result.reportId
    })

    return {
      success: true,
      reportId: result.reportId,
      reportData: result.reportData
    }

  } catch (error) {
    logger.error('Settlement report regeneration action failed', {
      tag: 'settlementReportRegenerationActionError',
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }
  }
}

/**
 * RPC関数を使用した直接レポート生成（管理用）
 */
export async function generateSettlementReportRpcAction(formData: FormData) {
  try {
    // 認証確認
    const user = await getCurrentUser()
    if (!user?.id) {
      redirect('/login')
    }

    // 入力値検証
    const rawData = {
      eventId: formData.get('eventId')?.toString() || ''
    }

    const validatedData = generateReportSchema.parse(rawData)

    // RPC関数を直接呼び出し
    const supabase = createClient()
    const { data: reportId, error } = await supabase
      .rpc('generate_settlement_report', {
        p_event_id: validatedData.eventId,
        p_organizer_id: user.id
      })

    if (error) {
      logger.error('RPC settlement report generation failed', {
        tag: 'settlementReportRpcError',
        eventId: validatedData.eventId,
        error: error.message
      })
      return {
        success: false,
        error: `RPC呼び出しに失敗しました: ${error.message}`
      }
    }

    logger.info('Settlement report generated via RPC', {
      tag: 'settlementReportRpc',
      userId: user.id,
      eventId: validatedData.eventId,
      reportId
    })

    return {
      success: true,
      reportId
    }

  } catch (error) {
    logger.error('Settlement report RPC action failed', {
      tag: 'settlementReportRpcActionError',
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }
  }
}
