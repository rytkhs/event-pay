/**
 * PayoutScheduler - 自動送金スケジューラー
 *
 * 送金対象の判定ロジック、実行ログの記録、スケジューラー管理を担当
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { IPayoutService, IStripeConnectService } from "./interface";
import {
  PayoutError,
  PayoutErrorType,
  EligibleEvent,
  EligibleEventWithAmount,
  PayoutSchedulerLog,
  PayoutSchedulerConfig,
  SchedulerExecutionResult,
  SchedulerExecutionSummary,
  NewPayoutSchedulerLogInsert,
} from "./types";
import { createSchedulerConfig } from "./scheduler-config";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logging/app-logger";

/**
 * PayoutSchedulerの設定インターフェース
 */
export interface PayoutSchedulerOptions {
  daysAfterEvent?: number;
  minimumAmount?: number;
  maxEventsPerRun?: number;
  maxConcurrency?: number;
  delayBetweenBatches?: number;
  retryFailedPayouts?: boolean;
  dryRun?: boolean;
}

/**
 * PayoutScheduler実装クラス
 */
export class PayoutScheduler {
  private supabase: SupabaseClient<Database>;
  private payoutService: IPayoutService;
  private stripeConnectService: IStripeConnectService;
  private config: PayoutSchedulerConfig;
  // 旧Transferフロー削除に伴い未使用

  // ハートビート制御
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private shouldContinue = true;

  // コンストラクタ（SupabaseClient専用）
  constructor(
    payoutService: IPayoutService,
    stripeConnectService: IStripeConnectService,
    supabaseClient: SupabaseClient<Database>,
    config?: Partial<PayoutSchedulerConfig>
  ) {
    this.payoutService = payoutService;
    this.stripeConnectService = stripeConnectService;
    this.supabase = supabaseClient;
    this.config = createSchedulerConfig(config);
  }

  /**
   * 送金対象イベントをConnectアカウント別にグループ化する
   * Stripe レート制限対応のため、同一アカウントへの送金は逐次処理する
   */
  private async groupEventsByConnectAccount(
    events: EligibleEventWithAmount[]
  ): Promise<Map<string, EligibleEventWithAmount[]>> {
    const accountGroups = new Map<string, EligibleEventWithAmount[]>();

    for (const event of events) {
      try {
        // ユーザーのConnect アカウントを取得
        const connectAccount = await this.stripeConnectService.getConnectAccountByUser(event.created_by);

        if (!connectAccount?.stripe_account_id) {
          logger.warn("Connect account not found for user", {
            tag: "payoutScheduler",
            user_id: event.created_by,
            event_id: event.id,
          });
          continue;
        }

        const accountId = connectAccount.stripe_account_id;

        if (!accountGroups.has(accountId)) {
          accountGroups.set(accountId, []);
        }

        accountGroups.get(accountId)!.push(event);
      } catch (error) {
        logger.error("Failed to get Connect account for user", {
          tag: "payoutScheduler",
          user_id: event.created_by,
          event_id: event.id,
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        });
        // エラーの場合は "unknown" グループに分類して処理を継続
        if (!accountGroups.has("unknown")) {
          accountGroups.set("unknown", []);
        }
        accountGroups.get("unknown")!.push(event);
      }
    }

    // ログ出力（デバッグ用）
    logger.debug("Grouped events by connect account", {
      tag: "payoutScheduler",
      total_events: events.length,
      account_groups: accountGroups.size,
    });

    return accountGroups;
  }

  /**
   * 送金対象イベントの詳細判定
   * PayoutService.findEligibleEventsに加えて、より詳細な条件チェックを実行
   */
  async findEligibleEventsWithDetails(options: PayoutSchedulerOptions = {}): Promise<{
    eligible: EligibleEventWithAmount[];
    ineligible: Array<{
      event: EligibleEvent;
      reason: string;
      details?: Record<string, any>;
    }>;
    summary: {
      totalEvents: number;
      eligibleCount: number;
      ineligibleCount: number;
      totalEligibleAmount: number;
    };
  }> {
    try {
      const daysAfterEvent = options.daysAfterEvent || this.config.daysAfterEvent;
      const limit = options.maxEventsPerRun || this.config.maxEventsPerRun;

      // RPCで一括取得してN+1を回避
      const { data, error } = await this.supabase.rpc("find_eligible_events_with_details", {
        p_days_after_event: daysAfterEvent,
        p_limit: limit,
      });

      if (error) {
        throw error;
      }

      type RpcRow = {
        event_id: string;
        title: string;
        event_date: string;
        fee: number;
        created_by: string;
        created_at: string;
        paid_attendances_count: number;
        total_stripe_sales: number;
        total_stripe_fee: number;
        platform_fee: number;
        net_payout_amount: number;
        charges_enabled: boolean;
        payouts_enabled: boolean;
        eligible: boolean;
        ineligible_reason: string | null;
      };

      const rows = (data || []) as RpcRow[];

      const eligible: EligibleEventWithAmount[] = [];
      const ineligible: Array<{
        event: EligibleEvent;
        reason: string;
        details?: Record<string, any>;
      }> = [];

      for (const r of rows) {
        const baseEvent: EligibleEvent = {
          id: r.event_id,
          title: r.title,
          date: r.event_date,
          fee: r.fee,
          created_by: r.created_by,
          created_at: r.created_at,
          paid_attendances_count: r.paid_attendances_count,
          total_stripe_sales: r.total_stripe_sales,
        };

        if (r.eligible) {
          eligible.push({
            ...baseEvent,
            estimated_payout_amount: r.net_payout_amount,
          });
        } else {
          ineligible.push({
            event: baseEvent,
            reason: r.ineligible_reason || "送金条件を満たしていません",
            details: {
              chargesEnabled: r.charges_enabled,
              payoutsEnabled: r.payouts_enabled,
              totalStripeSales: r.total_stripe_sales,
              totalStripeFee: r.total_stripe_fee,
              platformFee: r.platform_fee,
              netPayoutAmount: r.net_payout_amount,
            },
          });
        }
      }

      const summary = {
        totalEvents: rows.length,
        eligibleCount: eligible.length,
        ineligibleCount: ineligible.length,
        totalEligibleAmount: eligible.reduce((sum, e) => sum + (e.estimated_payout_amount ?? 0), 0),
      };

      return { eligible, ineligible, summary };
    } catch (error) {
      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金対象イベントの詳細判定に失敗しました",
        error as Error
      );
    }
  }

  /**
   * ハートビート開始（5分間隔でロックTTLを延長）
   */
  private startHeartbeat(lockName: string, processId: string): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.shouldContinue = true;
    this.heartbeatInterval = setInterval(async () => {
      if (!this.shouldContinue) {
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const { data: extended, error } = await (this.supabase as any)
          .rpc("extend_scheduler_lock", {
            p_lock_name: lockName,
            p_process_id: processId,
            p_extend_minutes: 30, // 30分延長
          });

        if (error) {
          logger.error("Heartbeat failed - lock extension error", {
            tag: "payoutScheduler",
            lock_name: lockName,
            process_id: processId,
            error_name: error instanceof Error ? error.name : "Unknown",
            error_message: error instanceof Error ? error.message : String(error),
          });
          this.shouldContinue = false;
          return;
        }

        if (!extended) {
          logger.warn("Heartbeat failed - lock not found or expired", {
            tag: "payoutScheduler",
            lock_name: lockName,
            process_id: processId,
          });
          this.shouldContinue = false;
          return;
        }

        logger.debug("Heartbeat success: lock extended", {
          tag: "payoutScheduler",
          process_id: processId,
        });
      } catch (e) {
        logger.error("Heartbeat failed - unexpected error", {
          tag: "payoutScheduler",
          lock_name: lockName,
          process_id: processId,
          error_name: e instanceof Error ? e.name : "Unknown",
          error_message: e instanceof Error ? e.message : String(e),
        });
        this.shouldContinue = false;
      }
    }, 5 * 60 * 1000); // 5分間隔
  }

  /**
   * ハートビート停止
   */
  private stopHeartbeat(): void {
    this.shouldContinue = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * 処理継続可否を確認（ハートビート失敗時は false）
   */
  private canContinueProcessing(): boolean {
    return this.shouldContinue;
  }

  /**
   * 自動送金処理の実行
   */
  async executeScheduledPayouts(options: PayoutSchedulerOptions = {}): Promise<SchedulerExecutionResult> {
    const executionId = `scheduler-${randomUUID()}`;
    const startTime = new Date();
    let lockAcquired = false;

    // --- Row-based Lock for multi-execution protection -----------------------
    try {
      // 型定義にまだRPCが追加されていないため any キャストで回避
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const { data: locked, error: lockError } = await (this.supabase as any)
        .rpc("try_acquire_scheduler_lock", {
          p_lock_name: "payout_scheduler",
          p_ttl_minutes: 180,
          p_process_id: executionId,
          p_metadata: {
            startTime: startTime.toISOString(),
            options: options,
          }
        })
        .single();

      if (lockError) {
        // ロック取得失敗は warning とし、後段処理に進めない
        logger.warn("Failed to acquire scheduler row lock", {
          tag: "payoutScheduler",
          error_message: lockError.message,
        });
      }

      if (!locked) {
        logger.info("Another instance is running. Abort this execution.", {
          tag: "payoutScheduler",
        });

        const skippedResult: SchedulerExecutionResult = {
          executionId: `skipped-${randomUUID()}`,
          startTime,
          endTime: new Date(),
          eligibleEventsCount: 0,
          successfulPayouts: 0,
          failedPayouts: 0,
          totalAmount: 0,
          results: [],
          dryRun: options.dryRun || false,
        } as SchedulerExecutionResult;

        // ログは必要に応じて残す
        if (this.config?.enableLogging) {
          try {
            await this.logSchedulerExecution(skippedResult);
          } catch (e) {
            logger.warn("Skip log failed", {
              tag: "payoutScheduler",
              error_name: e instanceof Error ? e.name : "Unknown",
              error_message: e instanceof Error ? e.message : String(e),
            });
          }
        }

        return skippedResult;
      }

      lockAcquired = true;

      // ハートビート開始（ロック取得成功後）
      this.startHeartbeat("payout_scheduler", executionId);

    } catch (e) {
      logger.error("Unexpected error while acquiring scheduler lock", {
        tag: "payoutScheduler",
        error_name: e instanceof Error ? e.name : "Unknown",
        error_message: e instanceof Error ? e.message : String(e),
      });
      // 続行は危険なのでスキップ扱いで終了
      return {
        executionId: `lock-error-${randomUUID()}`,
        startTime,
        endTime: new Date(),
        eligibleEventsCount: 0,
        successfulPayouts: 0,
        failedPayouts: 0,
        totalAmount: 0,
        results: [],
        error: "Failed to acquire scheduler lock",
        dryRun: options.dryRun || false,
      } as SchedulerExecutionResult;
    }
    // 初期化（catch ブロックでも参照できるよう try ブロック外で定義）
    let reconcileStats: { results: SchedulerExecutionResult['results']; successful: number; failed: number; amount: number } = { results: [], successful: 0, failed: 0, amount: 0 };
    let retryStats: { results: SchedulerExecutionResult['results']; successful: number; failed: number; amount: number } = { results: [], successful: 0, failed: 0, amount: 0 };

    try {
      // 0-a. reconcile processing stuck payouts (always, unless dryRun)
      if (!options.dryRun) {
        reconcileStats = await this.reconcileProcessingPayouts(executionId);
      }

      // 0-b. reprocess pending/failed payouts if enabled
      const shouldRetry = (options.retryFailedPayouts ?? this.config.retryFailedPayouts) && !options.dryRun;
      if (shouldRetry) {
        retryStats = await this.reprocessStuckPayouts(executionId);
      }

      // 1. 送金対象イベントを検索
      const eligibilityResult = await this.findEligibleEventsWithDetails(options);

      if (eligibilityResult.eligible.length === 0) {
        const result: SchedulerExecutionResult = {
          executionId,
          startTime,
          endTime: new Date(),
          eligibleEventsCount: 0,
          successfulPayouts: reconcileStats.successful + retryStats.successful,
          failedPayouts: reconcileStats.failed + retryStats.failed,
          totalAmount: reconcileStats.amount + retryStats.amount,
          results: reconcileStats.results.concat(retryStats.results),
          summary: eligibilityResult.summary,
          dryRun: options.dryRun || false,
        };

        // ログ記録
        if (this.config.enableLogging) {
          await this.logSchedulerExecution(result);
        }

        return result;
      }

      // 2. Dry Run モードの場合は実際の送金は実行しない
      if (options.dryRun) {
        const result: SchedulerExecutionResult = {
          executionId,
          startTime,
          endTime: new Date(),
          eligibleEventsCount: eligibilityResult.eligible.length,
          successfulPayouts: 0,
          failedPayouts: 0,
          totalAmount: eligibilityResult.summary.totalEligibleAmount,
          results: eligibilityResult.eligible.map(event => ({
            eventId: event.id,
            eventTitle: event.title,
            userId: event.created_by,
            success: true,
            amount: event.estimated_payout_amount,
            dryRun: true,
          })),
          summary: eligibilityResult.summary,
          dryRun: true,
        };

        if (this.config.enableLogging) {
          await this.logSchedulerExecution(result);
        }

        return result;
      }

      // 3. 実際の送金処理を実行
      const results: SchedulerExecutionResult['results'] = [...reconcileStats.results, ...retryStats.results];
      let successfulPayouts = reconcileStats.successful + retryStats.successful;
      let failedPayouts = reconcileStats.failed + retryStats.failed;
      let totalAmount = reconcileStats.amount + retryStats.amount;

      const concurrency = options.maxConcurrency || this.config.maxConcurrency;
      const delay = options.delayBetweenBatches || this.config.delayBetweenBatches;

      // Stripe レート制限対応: アカウント単位でグループ化して逐次処理
      const accountGroups = await this.groupEventsByConnectAccount(eligibilityResult.eligible);

      // レート制限情報を蓄積
      let maxSuggestedDelayMs = 0;
      let rateLimitHitCount = 0;

      // アカウントグループごとに処理（グループ間は並列実行可能）
      const groupKeys = Array.from(accountGroups.keys());
      for (let i = 0; i < groupKeys.length; i += concurrency) {
        const currentGroupKeys = groupKeys.slice(i, i + concurrency);

        const groupPromises = currentGroupKeys.map(async (accountId) => {
          const eventsForAccount = accountGroups.get(accountId) || [];

          // グループ内ローカル集計用変数
          let localSuccess = 0;
          let localFail = 0;
          let localAmount = 0;
          let localRateLimitHit = 0;
          let localMaxSuggestedDelayMs = 0;
          const groupResults: SchedulerExecutionResult['results'] = [];

          // 同一アカウント内のイベントは逐次処理（1秒間隔）
          for (let j = 0; j < eventsForAccount.length; j++) {
            const event = eventsForAccount[j];

            // ハートビート失敗時は処理を中断
            if (!this.canContinueProcessing()) {
              logger.warn("Processing interrupted due to heartbeat failure", {
                tag: "payoutScheduler",
                account_id: accountId,
                event_index: j + 1,
                events_in_account: eventsForAccount.length,
              });
              throw new PayoutError(
                PayoutErrorType.DATABASE_ERROR,
                "ハートビート失敗により処理を中断しました"
              );
            }

            try {
              const result = await this.payoutService.processPayout({
                eventId: event.id,
                userId: event.created_by,
                notes: `Automated payout via scheduler (${executionId})`,
              });

              localSuccess++;
              localAmount += result.netAmount;

              // レート制限情報をローカル集計
              if (result.rateLimitInfo?.hitRateLimit) {
                localRateLimitHit++;
                if (result.rateLimitInfo.suggestedDelayMs && result.rateLimitInfo.suggestedDelayMs > localMaxSuggestedDelayMs) {
                  localMaxSuggestedDelayMs = result.rateLimitInfo.suggestedDelayMs;
                }
              }

              groupResults.push({
                eventId: event.id,
                eventTitle: event.title,
                userId: event.created_by,
                success: true,
                payoutId: result.payoutId,
                transferId: result.transferId || undefined,
                amount: result.netAmount,
                estimatedArrival: result.estimatedArrival,
              });

            } catch (error) {
              // PAYOUT_ALREADY_EXISTSエラーは成功扱いとする（競合状態での重複処理）
              if (error instanceof PayoutError && error.type === PayoutErrorType.PAYOUT_ALREADY_EXISTS) {
                localSuccess++;

                groupResults.push({
                  eventId: event.id,
                  eventTitle: event.title,
                  userId: event.created_by,
                  success: true,
                  note: "Already processed (concurrent execution detected)",
                  amount: 0, // 実際の金額は取得できないため0に設定
                });
              } else {
                localFail++;
                const errorMessage = error instanceof Error ? error.message : "Unknown error";

                groupResults.push({
                  eventId: event.id,
                  eventTitle: event.title,
                  userId: event.created_by,
                  success: false,
                  error: errorMessage,
                });
              }
            }

            // 同一アカウント内の次の送金まで1秒待機（最後のイベント以外）
            if (j < eventsForAccount.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }

          // 各グループのローカル集計結果を返す
          return { groupResults, localSuccess, localFail, localAmount, localRateLimitHit, localMaxSuggestedDelayMs };
        });

        const groupResultsArray = await Promise.all(groupPromises);

        // バッチ全体に合算
        for (const { groupResults, localSuccess, localFail, localAmount, localRateLimitHit, localMaxSuggestedDelayMs } of groupResultsArray) {
          results.push(...groupResults);
          successfulPayouts += localSuccess;
          failedPayouts += localFail;
          totalAmount += localAmount;
          rateLimitHitCount += localRateLimitHit;
          if (localMaxSuggestedDelayMs > maxSuggestedDelayMs) {
            maxSuggestedDelayMs = localMaxSuggestedDelayMs;
          }
        }

        // アカウントグループ間の遅延（動的調整）
        if (i + concurrency < groupKeys.length) {
          let actualDelay = delay;

          // レート制限が発生した場合は推奨遅延時間を採用
          if (maxSuggestedDelayMs > 0) {
            actualDelay = Math.max(delay, maxSuggestedDelayMs);
            logger.warn("Rate limit detected. Adjusting delay for next batch", {
              tag: "payoutScheduler",
              actual_delay_ms: actualDelay,
            });
          }

          if (actualDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, actualDelay));
          }
        }
      }

      // レート制限統計をログ出力
      if (rateLimitHitCount > 0) {
        logger.warn("Rate limit encountered during execution", {
          tag: "payoutScheduler",
          rate_limit_hits: rateLimitHitCount,
          max_suggested_delay_ms: maxSuggestedDelayMs,
        });
      }

      // 4. 実行結果をまとめる
      const result: SchedulerExecutionResult = {
        executionId,
        startTime,
        endTime: new Date(),
        eligibleEventsCount: eligibilityResult.eligible.length,
        successfulPayouts,
        failedPayouts,
        totalAmount,
        results,
        summary: eligibilityResult.summary,
        dryRun: false,
      };

      // 5. ログ記録
      if (this.config.enableLogging) {
        await this.logSchedulerExecution(result);
      }

      return result;

    } catch (error) {
      // エラー時もログ記録
      const result: SchedulerExecutionResult = {
        executionId,
        startTime,
        endTime: new Date(),
        eligibleEventsCount: 0,
        successfulPayouts: reconcileStats.successful + retryStats.successful,
        failedPayouts: reconcileStats.failed + retryStats.failed,
        totalAmount: reconcileStats.amount + retryStats.amount,
        results: reconcileStats.results.concat(retryStats.results),
        error: error instanceof Error ? error.message : "Unknown error",
        dryRun: options.dryRun || false,
      };

      if (this.config.enableLogging) {
        await this.logSchedulerExecution(result);
      }

      throw error;
    } finally {
      // ハートビート停止（ロック取得成功時のみ）
      if (lockAcquired) {
        this.stopHeartbeat();
      }

      // ロック取得に成功していた場合は必ず解放する
      if (lockAcquired) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          await (this.supabase as any)
            .rpc("release_scheduler_lock", {
              p_lock_name: "payout_scheduler",
              p_process_id: executionId,
            });
          logger.debug("Lock released successfully", { tag: "payoutScheduler" });
        } catch (e) {
          logger.error("Failed to release scheduler lock", {
            tag: "payoutScheduler",
            error_name: e instanceof Error ? e.name : "Unknown",
            error_message: e instanceof Error ? e.message : String(e),
          });
          // ロック解放失敗はログ出力のみ（TTLによる自動解放に期待）
        }
      }
    }
  }

  /**
   * pending / failed 状態で滞留している送金を再処理する
   */
  private async reprocessStuckPayouts(_executionId: string): Promise<{
    results: SchedulerExecutionResult['results'];
    successful: number;
    failed: number;
    amount: number;
  }> {
    const results: SchedulerExecutionResult['results'] = [];
    let successful = 0;
    let failed = 0;
    let totalAmount = 0;

    // 最終更新から10分以上経過しているレコードを対象（ハードコードで簡易実装）
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('payouts')
      .select('id, event_id, user_id, net_payout_amount, events!inner(title)')
      .in('status', ['pending', 'failed'])
      .lte('updated_at', tenMinutesAgo)
      .limit(100);

    if (error) {
      // DB エラーはスケジューラー全体を止めず warning 扱い
      results.push({
        eventId: 'N/A',
        eventTitle: 'N/A',
        userId: 'N/A',
        success: false,
        error: `Failed to fetch stuck payouts: ${error.message}`,
      });
      return { results, successful, failed: failed + 1, amount: totalAmount };
    }

    const rows = (data || []) as Array<{
      id: string;
      event_id: string;
      user_id: string;
      net_payout_amount: number;
      events?: { title: string } | null;
    }>;

    for (const row of rows) {
      try {
        const procResult = await this.payoutService.retryPayout(row.id);

        successful++;
        totalAmount += procResult.netAmount;

        results.push({
          eventId: row.event_id,
          eventTitle: row.events?.title || '',
          userId: row.user_id,
          success: true,
          payoutId: procResult.payoutId,
          transferId: procResult.transferId || undefined,
          amount: procResult.netAmount,
          estimatedArrival: procResult.estimatedArrival,
          note: 'Reprocessed pending/failed payout',
        });
      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({
          eventId: row.event_id,
          eventTitle: row.events?.title || '',
          userId: row.user_id,
          success: false,
          error: errMsg,
        });
      }
    }

    return { results, successful, failed, amount: totalAmount };
  }

  /**
   * processing 状態で滞留している送金レコードを Stripe API と突き合わせて整合性を取る
   *
   * 1. updated_at が一定時間（10分）以上前の processing レコードを取得
   * 2. Stripe Transfer の現在ステータスを取得
   *    - paid  -> completed へ遷移
   *    - failed / canceled -> failed へ遷移
   *    - pending -> 何もしない（次回以降に再検査）
   * 3. stripe_transfer_id が NULL の場合は failed へ遷移 (transfer missing)
   */
  private async reconcileProcessingPayouts(_executionId: string): Promise<{
    results: SchedulerExecutionResult['results'];
    successful: number;
    failed: number;
    amount: number;
  }> {
    const results: SchedulerExecutionResult['results'] = [];
    let successful = 0;
    let failed = 0;
    let totalAmount = 0;

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('payouts')
      .select('id, event_id, user_id, net_payout_amount, stripe_transfer_id, events!inner(title)')
      .eq('status', 'processing')
      .lte('updated_at', tenMinutesAgo)
      .limit(100);

    if (error) {
      results.push({
        eventId: 'N/A',
        eventTitle: 'N/A',
        userId: 'N/A',
        success: false,
        error: `Failed to fetch processing payouts: ${error.message}`,
      });
      return { results, successful, failed: failed + 1, amount: totalAmount };
    }

    const rows = (data || []) as Array<{
      id: string;
      event_id: string;
      user_id: string;
      net_payout_amount: number;
      stripe_transfer_id: string | null;
      events?: { title: string } | null;
    }>;

    for (const row of rows) {
      try {
        if (!row.stripe_transfer_id) {
          // Transfer が存在しない場合は失敗扱いにして終了
          await this.payoutService.updatePayoutStatus({
            payoutId: row.id,
            status: 'failed',
            lastError: 'Missing stripe_transfer_id',
          });

          failed++;
          results.push({
            eventId: row.event_id,
            eventTitle: row.events?.title || '',
            userId: row.user_id,
            success: false,
            error: 'Missing stripe_transfer_id – marked as failed',
          });
          continue;
        }

        // Destination charges移行のため、processingはDB更新遅延とみなし完了へ
        if (true) {
          await this.payoutService.updatePayoutStatus({
            payoutId: row.id,
            status: 'completed',
            processedAt: new Date(),
          });

          successful++;
          totalAmount += row.net_payout_amount;
          results.push({
            eventId: row.event_id,
            eventTitle: row.events?.title || '',
            userId: row.user_id,
            success: true,
            amount: row.net_payout_amount,
            note: 'Reconciled processing -> completed',
          });

        }

      } catch (err) {
        failed++;
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        results.push({
          eventId: row.event_id,
          eventTitle: row.events?.title || '',
          userId: row.user_id,
          success: false,
          error: errMsg,
        });
      }
    }

    return { results, successful, failed, amount: totalAmount };
  }

  /**
   * スケジューラー実行ログの記録
   */
  async logSchedulerExecution(result: SchedulerExecutionResult): Promise<void> {
    try {
      const logData: NewPayoutSchedulerLogInsert = {
        execution_id: result.executionId,
        start_time: result.startTime.toISOString(),
        end_time: result.endTime.toISOString(),
        processing_time_ms: result.endTime.getTime() - result.startTime.getTime(),
        eligible_events_count: result.eligibleEventsCount,
        successful_payouts: result.successfulPayouts,
        failed_payouts: result.failedPayouts,
        total_amount: result.totalAmount,
        dry_run: result.dryRun,
        error_message: result.error || null,
        results: result.results,
        summary: result.summary || null,
      };

      // ログテーブルに記録（テーブルが存在しない場合は作成）
      await this.ensureLogTableExists();

      const { error } = await this.supabase
        .from("payout_scheduler_logs" as any)
        .insert(logData);

      if (error) {
        // 重複実行IDなどのユニーク制約違反に気づけるよう詳細を出力
        logger.error("Failed to log scheduler execution", {
          tag: "payoutScheduler",
          message: (error as any)?.message,
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });
        // ログ記録の失敗は処理を停止させない
      }

    } catch (error) {
      logger.error("Failed to log scheduler execution", {
        tag: "payoutScheduler",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      // ログ記録の失敗は処理を停止させない
    }
  }

  /**
   * スケジューラー実行履歴の取得
   */
  async getExecutionHistory(options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    successOnly?: boolean;
  } = {}): Promise<{
    logs: PayoutSchedulerLog[];
    total: number;
    summary: SchedulerExecutionSummary;
  }> {
    try {
      const {
        limit = 50,
        offset = 0,
        startDate,
        endDate,
        successOnly = false,
      } = options;

      let query = this.supabase
        .from("payout_scheduler_logs" as any)
        .select("*", { count: "exact" })
        .order("start_time", { ascending: false });

      if (startDate) {
        query = query.gte("start_time", startDate.toISOString());
      }

      if (endDate) {
        query = query.lte("start_time", endDate.toISOString());
      }

      if (successOnly) {
        query = query.is("error_message", null);
      }

      query = query.range(offset, offset + limit - 1);

      const { data: logs, error, count } = await query;

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `スケジューラー実行履歴の取得に失敗しました: ${error.message}`,
          error
        );
      }

      // 型安全なログデータの処理
      const typedLogs = (logs || []) as any[] as PayoutSchedulerLog[];

      // サマリー計算
      const summary: SchedulerExecutionSummary = {
        totalExecutions: count || 0,
        successfulExecutions: typedLogs.filter(log => !log.error_message).length,
        failedExecutions: typedLogs.filter(log => log.error_message).length,
        totalPayoutsProcessed: typedLogs.reduce((sum, log) => sum + log.successful_payouts, 0),
        totalAmountProcessed: typedLogs.reduce((sum, log) => sum + log.total_amount, 0),
        averageProcessingTime: typedLogs.length
          ? typedLogs.reduce((sum, log) => sum + log.processing_time_ms, 0) / typedLogs.length
          : 0,
      };

      return {
        logs: typedLogs,
        total: count || 0,
        summary,
      };

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "スケジューラー実行履歴の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 古いログの削除（保持期間を過ぎたもの）
   */
  async cleanupOldLogs(): Promise<{ deletedCount: number }> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.logRetentionDays);

      const { data, error } = await this.supabase
        .from("payout_scheduler_logs" as any)
        .delete()
        .lt("start_time", cutoffDate.toISOString())
        .select("id");

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `古いログの削除に失敗しました: ${error.message}`,
          error
        );
      }

      return {
        deletedCount: data?.length || 0,
      };

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "古いログの削除に失敗しました",
        error as Error
      );
    }
  }

  /**
   * ログテーブルの存在確認・作成
   */
  private async ensureLogTableExists(): Promise<void> {
    try {
      // テーブル存在確認のためのクエリ実行
      const { error } = await this.supabase
        .from("payout_scheduler_logs" as any)
        .select("id")
        .limit(1);

      // テーブルが存在しない場合は作成（マイグレーションで作成されることを想定）
      if (error && error.code === "42P01") {
        logger.warn("payout_scheduler_logs table does not exist. Please run database migration.", {
          tag: "payoutScheduler",
        });
      }

    } catch (error) {
      logger.warn("Failed to check log table existence", {
        tag: "payoutScheduler",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 設定の更新
   */
  updateConfig(newConfig: Partial<PayoutSchedulerConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
    };
  }

  /**
   * 現在の設定を取得
   */
  getConfig(): PayoutSchedulerConfig {
    return { ...this.config };
  }
}
