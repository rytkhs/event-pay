/**
 * 期限切れスケジューラーロック削除API
 *
 * Cronジョブや定期実行タスクから呼び出される内部API
 * HMAC認証またはサービスロール認証で保護する
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import { createProblemResponse } from '@core/api/problem-details'
import { logger } from '@core/logging/app-logger'
import { getSecureClientFactory } from '@core/security/secure-client-factory.impl'
import { AdminReason, type AuditContext } from '@core/security/secure-client-factory.types'

export async function POST(request: NextRequest) {
  try {
    // シンプルなBearer token認証（環境変数のトークンと照合）
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.INTERNAL_API_TOKEN

    if (!expectedToken) {
      logger.error('INTERNAL_API_TOKEN is not configured', {
        tag: 'internalApiTokenNotConfigured',
      })
      return createProblemResponse('INTERNAL_ERROR', {
        instance: '/api/internal/scheduler/cleanup',
        detail: 'Internal API not configured',
      })
    }

    if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== expectedToken) {
      return createProblemResponse('UNAUTHORIZED', {
        instance: '/api/internal/scheduler/cleanup',
        detail: 'Unauthorized',
      })
    }

    // セキュアな管理者クライアントで期限切れロック削除を実行
    const clientFactory = getSecureClientFactory()

    const auditContext: AuditContext = {
      ipAddress:
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'internal-scheduler',
      requestPath: '/api/internal/scheduler/cleanup',
      requestMethod: 'POST',
      operationType: 'DELETE',
      additionalInfo: {
        taskType: 'scheduler_lock_cleanup',
        triggeredBy: 'cron_job',
      },
    }

    const supabase = await clientFactory.createAuditedAdminClient(
      AdminReason.SYSTEM_MAINTENANCE,
      'Scheduled cleanup of expired scheduler locks',
      auditContext
    )

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await supabase.rpc('cleanup_expired_scheduler_locks').single()

    if (error) {
      logger.error('Failed to cleanup expired scheduler locks', {
        tag: 'schedulerLockCleanupFailed',
        error_message: error.message,
      })
      return createProblemResponse('DATABASE_ERROR', {
        instance: '/api/internal/scheduler/cleanup',
        detail: `Cleanup failed: ${error.message}`,
      })
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { deleted_count, expired_locks } = data as {
      deleted_count: number
      expired_locks: Array<{
        lock_name: string
        acquired_at: string
        expires_at: string
        process_id: string
      }>
    }

    logger.info('Scheduler lock cleanup completed', {
      tag: 'schedulerLockCleanupCompleted',
      deleted_count,
      expired_locks_count: expired_locks?.length || 0,
    })

    return NextResponse.json({
      success: true,
      deletedCount: deleted_count,
      expiredLocks: expired_locks,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Unexpected error in scheduler lock cleanup', {
      tag: 'schedulerLockCleanupUnexpectedError',
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error),
    })
    return createProblemResponse('INTERNAL_ERROR', {
      instance: '/api/internal/scheduler/cleanup',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// GET メソッドでロック状態確認も提供
export async function GET(request: NextRequest) {
  try {
    // 同様の認証チェック
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.INTERNAL_API_TOKEN

    if (!expectedToken) {
      return createProblemResponse('INTERNAL_ERROR', {
        instance: '/api/internal/scheduler/cleanup',
        detail: 'Internal API not configured',
      })
    }

    if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== expectedToken) {
      return createProblemResponse('UNAUTHORIZED', {
        instance: '/api/internal/scheduler/cleanup',
        detail: 'Unauthorized',
      })
    }

    // セキュアな管理者クライアントでロック状態を確認
    const clientFactory = getSecureClientFactory()

    const auditContext: AuditContext = {
      ipAddress:
        request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'internal-scheduler',
      requestPath: '/api/internal/scheduler/cleanup',
      requestMethod: 'GET',
      operationType: 'SELECT',
      additionalInfo: {
        taskType: 'scheduler_lock_status_check',
        triggeredBy: 'system_monitoring',
      },
    }

    const supabase = await clientFactory.createAuditedAdminClient(
      AdminReason.SYSTEM_MAINTENANCE,
      'System check of scheduler lock status',
      auditContext
    )

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await supabase.rpc('get_scheduler_lock_status')

    if (error) {
      logger.error('Failed to get scheduler lock status', {
        tag: 'schedulerLockStatusFailed',
        error_message: error.message,
      })
      return createProblemResponse('DATABASE_ERROR', {
        instance: '/api/internal/scheduler/cleanup',
        detail: `Status check failed: ${error.message}`,
      })
    }

    return NextResponse.json({
      success: true,
      locks: data || [],
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('Unexpected error in scheduler lock status check', {
      tag: 'schedulerLockStatusUnexpectedError',
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error),
    })
    return createProblemResponse('INTERNAL_ERROR', {
      instance: '/api/internal/scheduler/cleanup',
      detail: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}
