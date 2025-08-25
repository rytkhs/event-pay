'use server'

import { createClient } from '@/lib/supabase/server'
import { SettlementReportService } from '@/lib/services/settlement-report/service'
import { logger } from '@/lib/logging/app-logger'
import { getCurrentUser } from '@/lib/auth/auth-utils'
import { redirect } from 'next/navigation'
import { z } from 'zod'

// バリデーションスキーマ
const generateReportSchema = z.object({
  eventId: z.string().uuid()
})

const getReportsSchema = z.object({
  eventIds: z.array(z.string().uuid()).optional(),
  // UI からは YYYY-MM-DD 形式で送信されるため、日付のみの文字列を許可
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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
      eventId: formData.get('eventId')?.toString() || ''
    }

    const validatedData = generateReportSchema.parse(rawData)

    // サービス実行
    const supabase = createClient()
    const service = new SettlementReportService(supabase)

    const result = await service.generateSettlementReport({
      eventId: validatedData.eventId,
      createdBy: user.id
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
      createdBy: user.id,
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
      createdBy: user.id,
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
