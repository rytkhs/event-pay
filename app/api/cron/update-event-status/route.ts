import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateCronSecret, logCronActivity } from '@/lib/cron-auth';
import { updateEventStatus, getCurrentTime } from '@/lib/event-status-updater';
import { EVENT_CONFIG } from '@/lib/constants/event-config';
import { createApiError, createErrorResponse, createSuccessResponse, ERROR_CODES } from '@/lib/utils/api-error';
import { processBatch, getBatchSummary } from '@/lib/utils/batch-processor';
import type { CronExecutionData } from '@/lib/types/api-response';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // 1. 認証チェック
    logCronActivity('info', 'Cron job started: update-event-status');
    
    const authResult = validateCronSecret(request);
    if (!authResult.isValid) {
      logCronActivity('error', 'Authentication failed', { error: authResult.error });
      const error = createApiError(
        ERROR_CODES.UNAUTHORIZED,
        authResult.error || 'Authentication failed'
      );
      return createErrorResponse(error, 401);
    }

    // 2. Supabaseクライアント作成
    const supabase = createClient();

    // 3. 対象イベントを取得
    const { data: events, error: fetchError } = await supabase
      .from('events')
      .select('id, status, date')
      .in('status', EVENT_CONFIG.UPDATABLE_STATUSES); // 更新対象のステータスのみ

    if (fetchError) {
      logCronActivity('error', 'Failed to fetch events', { error: fetchError });
      const error = createApiError(
        ERROR_CODES.DATABASE_ERROR,
        'Failed to fetch events',
        { originalError: fetchError }
      );
      return createErrorResponse(error, 500);
    }

    if (!events || events.length === 0) {
      logCronActivity('info', 'No events found for status update');
      const data: CronExecutionData = {
        message: 'No events to update',
        updatesCount: 0,
        processingTime: Date.now() - startTime,
      };
      return createSuccessResponse(data);
    }

    // 4. ステータス更新ロジックを実行
    const currentTime = getCurrentTime();
    const updateResult = updateEventStatus(events, currentTime);

    // 5. データベース更新を実行（バッチ処理で部分失敗に対応）
    let actualUpdatesCount = 0;
    const failedUpdates: string[] = [];

    if (updateResult.updatesCount > 0) {
      const batchResult = await processBatch(
        updateResult.updates,
        async (update) => {
          const { error } = await supabase
            .from('events')
            .update({ status: update.newStatus })
            .eq('id', update.id);

          if (error) {
            logCronActivity('error', `Failed to update event ${update.id}`, { error });
            throw error;
          }

          logCronActivity('info', `Event status updated: ${update.id}`, {
            from: update.oldStatus,
            to: update.newStatus,
            reason: update.reason,
          });

          return { id: update.id, updated: true };
        },
        { continueOnError: true, maxConcurrency: 3 } // 部分失敗でも継続、最大3並列
      );

      const summary = getBatchSummary(batchResult);
      actualUpdatesCount = summary.successCount;
      
      // 失敗したイベントIDをログに記録
      if (batchResult.failed.length > 0) {
        const failedIds = batchResult.failed.map(f => f.item.id);
        failedUpdates.push(...failedIds);
        logCronActivity('warning', 'Some events failed to update', {
          failedEventIds: failedIds,
          failureCount: summary.failureCount,
          successCount: summary.successCount,
          successRate: summary.successRate,
        });
      }
    }

    // 6. 成功レスポンス（部分失敗を含む）
    const processingTime = Date.now() - startTime;
    const hasFailures = failedUpdates.length > 0;
    
    logCronActivity(hasFailures ? 'warning' : 'success', 'Cron job completed', {
      plannedUpdates: updateResult.updatesCount,
      actualUpdates: actualUpdatesCount,
      failedUpdates: failedUpdates.length,
      skippedCount: updateResult.skipped.length,
      processingTime,
    });

    const data: CronExecutionData = {
      message: hasFailures 
        ? `Event status update completed with ${failedUpdates.length} failures`
        : 'Event status update completed successfully',
      updatesCount: actualUpdatesCount,
      skippedCount: updateResult.skipped.length,
      updates: updateResult.updates.filter(update => !failedUpdates.includes(update.id)),
      processingTime,
    };

    return createSuccessResponse(data);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logCronActivity('error', 'Cron job failed with unexpected error', {
      error: errorMessage,
      processingTime,
    });

    const apiError = createApiError(
      ERROR_CODES.INTERNAL_ERROR,
      'Unexpected error occurred during event status update',
      { originalError: errorMessage, processingTime }
    );
    
    return createErrorResponse(apiError, 500);
  }
}

// GET メソッドも作成（ヘルスチェック用）
export async function GET(request: NextRequest) {
  try {
    // 認証チェック
    const authResult = validateCronSecret(request);
    if (!authResult.isValid) {
      const error = createApiError(
        ERROR_CODES.UNAUTHORIZED,
        authResult.error || 'Authentication failed'
      );
      return createErrorResponse(error, 401);
    }

    const data = {
      message: 'Event status update cron endpoint is healthy',
      timestamp: new Date().toISOString(),
    };
    return createSuccessResponse(data);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const apiError = createApiError(
      ERROR_CODES.INTERNAL_ERROR,
      'Health check failed',
      { originalError: errorMessage }
    );
    return createErrorResponse(apiError, 500);
  }
}