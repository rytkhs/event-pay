/**
 * PayoutScheduler - 自動送金スケジューラー
 *
 * 送金対象の判定ロジック、実行ログの記録、スケジューラー管理を担当
 */

import { createClient } from "@supabase/supabase-js";
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
  private supabase: ReturnType<typeof createClient<Database>>;
  private payoutService: IPayoutService;
  private stripeConnectService: IStripeConnectService;
  private config: PayoutSchedulerConfig;

  constructor(
    payoutService: IPayoutService,
    stripeConnectService: IStripeConnectService,
    supabaseUrl?: string,
    supabaseKey?: string,
    config?: Partial<PayoutSchedulerConfig>
  ) {
    this.payoutService = payoutService;
    this.stripeConnectService = stripeConnectService;

    // Supabaseクライアント初期化
    this.supabase = createClient<Database>(
      supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // デフォルト設定
    this.config = {
      daysAfterEvent: 5,
      minimumAmount: 100,
      maxEventsPerRun: 100,
      maxConcurrency: 3,
      delayBetweenBatches: 1000,
      retryFailedPayouts: false,
      enableLogging: true,
      logRetentionDays: 30,
      ...config,
    };
  }

  /**
   * 送金対象イベントの詳細判定
   * PayoutService.findEligibleEventsに加えて、より詳細な条件チェックを実行
   */
  async findEligibleEventsWithDetails(options: PayoutSchedulerOptions = {}): Promise<{
    eligible: EligibleEvent[];
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
      const searchOptions = {
        daysAfterEvent: options.daysAfterEvent || this.config.daysAfterEvent,
        minimumAmount: options.minimumAmount || this.config.minimumAmount,
        limit: options.maxEventsPerRun || this.config.maxEventsPerRun,
      };

      // 基本的な送金対象イベントを取得
      const candidateEvents = await this.payoutService.findEligibleEvents(searchOptions);

      const eligible: EligibleEvent[] = [];
      const ineligible: Array<{
        event: EligibleEvent;
        reason: string;
        details?: Record<string, any>;
      }> = [];

      // 各イベントの詳細チェック
      for (const event of candidateEvents) {
        try {
          // 1. Stripe Connectアカウントの詳細チェック
          const connectAccount = await this.stripeConnectService.getConnectAccountByUser(event.created_by);
          if (!connectAccount) {
            ineligible.push({
              event,
              reason: "Stripe Connectアカウントが設定されていません",
            });
            continue;
          }

          if (!connectAccount.payouts_enabled) {
            ineligible.push({
              event,
              reason: "Stripe Connectアカウントで送金が有効になっていません",
              details: {
                accountStatus: connectAccount.status,
                chargesEnabled: connectAccount.charges_enabled,
                payoutsEnabled: connectAccount.payouts_enabled,
              },
            });
            continue;
          }

          // 2. 送金可能性の最終チェック
          const eligibility = await this.payoutService.checkPayoutEligibility(event.id, event.created_by);
          if (!eligibility.eligible) {
            ineligible.push({
              event,
              reason: eligibility.reason || "送金条件を満たしていません",
              details: {
                estimatedAmount: eligibility.estimatedAmount,
              },
            });
            continue;
          }

          // 3. 送金金額の詳細計算
          const calculation = await this.payoutService.calculatePayoutAmount(event.id);
          if (calculation.netPayoutAmount <= 0) {
            ineligible.push({
              event,
              reason: "送金可能な金額がありません",
              details: {
                totalStripeSales: calculation.totalStripeSales,
                totalStripeFee: calculation.totalStripeFee,
                platformFee: calculation.platformFee,
                netPayoutAmount: calculation.netPayoutAmount,
              },
            });
            continue;
          }

          // すべてのチェックを通過
          eligible.push({
            ...event,
            estimated_payout_amount: calculation.netPayoutAmount,
          } as EligibleEventWithAmount);

        } catch (error) {
          ineligible.push({
            event,
            reason: "送金可能性チェック中にエラーが発生しました",
            details: {
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        }
      }

      const summary = {
        totalEvents: candidateEvents.length,
        eligibleCount: eligible.length,
        ineligibleCount: ineligible.length,
        totalEligibleAmount: eligible.reduce((sum, e) => sum + ((e as EligibleEventWithAmount).estimated_payout_amount || 0), 0),
      };

      return {
        eligible,
        ineligible,
        summary,
      };

    } catch (error) {
      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金対象イベントの詳細判定に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 自動送金処理の実行
   */
  async executeScheduledPayouts(options: PayoutSchedulerOptions = {}): Promise<SchedulerExecutionResult> {
    const executionId = `scheduler-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = new Date();

    try {
      // 1. 送金対象イベントを検索
      const eligibilityResult = await this.findEligibleEventsWithDetails(options);

      if (eligibilityResult.eligible.length === 0) {
        const result: SchedulerExecutionResult = {
          executionId,
          startTime,
          endTime: new Date(),
          eligibleEventsCount: 0,
          successfulPayouts: 0,
          failedPayouts: 0,
          totalAmount: 0,
          results: [],
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
            amount: (event as EligibleEventWithAmount).estimated_payout_amount,
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
      const results: SchedulerExecutionResult['results'] = [];
      let successfulPayouts = 0;
      let failedPayouts = 0;
      let totalAmount = 0;

      const concurrency = options.maxConcurrency || this.config.maxConcurrency;
      const delay = options.delayBetweenBatches || this.config.delayBetweenBatches;

      // バッチ処理で送金実行
      for (let i = 0; i < eligibilityResult.eligible.length; i += concurrency) {
        const batch = eligibilityResult.eligible.slice(i, i + concurrency);

        const batchPromises = batch.map(async (event) => {
          try {
            const result = await this.payoutService.processPayout({
              eventId: event.id,
              userId: event.created_by,
              notes: `Automated payout via scheduler (${executionId})`,
            });

            successfulPayouts++;
            totalAmount += result.netAmount;

            return {
              eventId: event.id,
              eventTitle: event.title,
              userId: event.created_by,
              success: true,
              payoutId: result.payoutId,
              transferId: result.transferId || undefined,
              amount: result.netAmount,
              estimatedArrival: result.estimatedArrival,
            };

          } catch (error) {
            failedPayouts++;
            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            return {
              eventId: event.id,
              eventTitle: event.title,
              userId: event.created_by,
              success: false,
              error: errorMessage,
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // バッチ間の遅延
        if (i + concurrency < eligibilityResult.eligible.length && delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
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
        successfulPayouts: 0,
        failedPayouts: 0,
        totalAmount: 0,
        results: [],
        error: error instanceof Error ? error.message : "Unknown error",
        dryRun: options.dryRun || false,
      };

      if (this.config.enableLogging) {
        await this.logSchedulerExecution(result);
      }

      throw error;
    }
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
        console.error("Failed to log scheduler execution:", {
          message: (error as any)?.message,
          code: (error as any)?.code,
          details: (error as any)?.details,
          hint: (error as any)?.hint,
        });
        // ログ記録の失敗は処理を停止させない
      }

    } catch (error) {
      console.error("Failed to log scheduler execution:", error);
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
        console.warn("payout_scheduler_logs table does not exist. Please run database migration.");
      }

    } catch (error) {
      console.warn("Failed to check log table existence:", error);
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
