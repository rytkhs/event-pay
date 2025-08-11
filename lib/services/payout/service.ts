/**
 * PayoutServiceの基本実装
 */

import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { stripe } from "@/lib/stripe/client";
import { IPayoutService, IPayoutErrorHandler, IPayoutValidator } from "./interface";
import { PayoutStatus } from "./types";
import { IStripeConnectService } from "../stripe-connect/interface";
import {
  Payout,
  EligibleEvent,
  ProcessPayoutParams,
  ProcessPayoutResult,
  PayoutCalculation,
  UpdatePayoutStatusParams,
  GetPayoutHistoryParams,
  FindEligibleEventsParams,
  PayoutError,
  PayoutErrorType,
  StripeFeeConfig,
  PlatformFeeConfig,
  ValidateManualPayoutParams,
  ManualPayoutEligibilityResult,
} from "./types";
import { PayoutCalculator } from "./calculation";
import { getJstYmdDaysAgo, hasElapsedDaysInJst } from "@/lib/utils/timezone";
import { getTransferGroupForEvent } from "@/lib/utils/stripe";
import { StripeTransferService } from "./stripe-transfer";

/**
 * PayoutServiceの実装クラス
 */
export class PayoutService implements IPayoutService {
  private supabase: ReturnType<typeof createClient<Database>>;
  private stripe = stripe;
  private errorHandler: IPayoutErrorHandler;
  private stripeConnectService: IStripeConnectService;
  private stripeTransferService: StripeTransferService;
  private validator: IPayoutValidator;

  // 手数料設定（設定ファイルから読み込むことも可能）
  private stripeFeeConfig: StripeFeeConfig = {
    baseRate: 0.036, // 3.6%
    fixedFee: 0, // 0円
  };

  private platformFeeConfig: PlatformFeeConfig = {
    rate: 0, // MVP段階では0%
    fixedFee: 0,
    minimumFee: 0,
    maximumFee: 0,
  };

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    errorHandler: IPayoutErrorHandler,
    stripeConnectService: IStripeConnectService,
    validator: IPayoutValidator,
    stripeTransferService?: StripeTransferService
  ) {
    this.supabase = createClient<Database>(supabaseUrl, supabaseKey);
    this.errorHandler = errorHandler;
    this.stripeConnectService = stripeConnectService;
    this.validator = validator;
    this.stripeTransferService = stripeTransferService || new StripeTransferService();
  }

  /**
   * 送金対象イベントを検索する
   */
  async findEligibleEvents(params: FindEligibleEventsParams = {}): Promise<EligibleEvent[]> {
    try {
      const {
        daysAfterEvent = 5,
        minimumAmount = 100, // 最小100円
        userId,
        limit = 50,
      } = params;

      // イベント終了日の計算（現在日時から指定日数前）
      // JSTの暦日差で daysAfterEvent 日前の YYYY-MM-DD を生成
      const cutoffDateString = getJstYmdDaysAgo(daysAfterEvent);

      // 送金対象イベントを検索するクエリ
      let query = this.supabase
        .from("events")
        .select(`
          id,
          title,
          date,
          fee,
          created_by,
          created_at,
          attendances!inner (
            id,
            status,
            payments!inner (
              id,
              method,
              status,
              amount
            )
          )
        `)
        .eq("status", "past")
        .lte("date", cutoffDateString)
        .eq("attendances.status", "attending")
        .eq("attendances.payments.method", "stripe")
        .eq("attendances.payments.status", "paid");

      // 特定ユーザーのイベントのみ検索
      if (userId) {
        query = query.eq("created_by", userId);
      }

      query = query.limit(limit);

      const { data: eventsData, error } = await query;

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金対象イベントの検索に失敗しました: ${error.message}`,
          error
        );
      }

      if (!eventsData || eventsData.length === 0) {
        return [];
      }

      // 既に送金済みのイベントを除外
      const eventIds = eventsData.map(event => event.id);
      const { data: existingPayouts, error: payoutError } = await this.supabase
        .from("payouts")
        .select("event_id")
        .in("event_id", eventIds)
        .in("status", ["pending", "processing", "completed"]);

      if (payoutError) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `既存送金レコードの確認に失敗しました: ${payoutError.message}`,
          payoutError
        );
      }

      const processedEventIds = new Set(existingPayouts?.map(p => p.event_id) || []);

      // 結果を整形し、最小金額以上のイベントのみ返す
      const eligibleEvents: EligibleEvent[] = [];

      for (const event of eventsData) {
        // 既に送金済みのイベントはスキップ
        if (processedEventIds.has(event.id)) {
          continue;
        }

        // Stripe決済の売上を集計
        const stripePayments = event.attendances
          .flatMap(attendance => attendance.payments)
          .filter(payment => payment.method === "stripe" && payment.status === "paid");

        const totalStripeSales = stripePayments.reduce((sum, payment) => sum + payment.amount, 0);
        const paidAttendancesCount = stripePayments.length;

        // 最小金額チェック
        if (totalStripeSales < minimumAmount) {
          continue;
        }

        eligibleEvents.push({
          id: event.id,
          title: event.title,
          date: event.date,
          fee: event.fee,
          created_by: event.created_by,
          created_at: event.created_at,
          paid_attendances_count: paidAttendancesCount,
          total_stripe_sales: totalStripeSales,
        });
      }

      return eligibleEvents;
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金対象イベントの検索に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 送金金額を計算する
   */
  async calculatePayoutAmount(eventId: string): Promise<PayoutCalculation> {
    try {
      // イベントのStripe決済データを取得
      const { data: paymentsData, error } = await this.supabase
        .from("payments")
        .select(`
          amount,
          method,
          status,
          attendances!inner (
            event_id
          )
        `)
        .eq("attendances.event_id", eventId)
        .eq("method", "stripe")
        .eq("status", "paid");

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `決済データの取得に失敗しました: ${error.message}`,
          error
        );
      }

      // 決済データを計算用の形式に変換
      const payments = (paymentsData || []).map(p => ({
        amount: p.amount,
        method: p.method,
        status: p.status,
      }));

      // 新しい計算ロジックを使用
      const calculator = new PayoutCalculator(this.stripeFeeConfig, this.platformFeeConfig);
      const result = calculator.calculateBasicPayout(payments);

      // バリデーション: 負の値チェック
      if (result.netPayoutAmount < 0) {
        throw new PayoutError(
          PayoutErrorType.CALCULATION_ERROR,
          "送金金額の計算結果が負の値になりました。手数料設定を確認してください。",
          undefined,
          {
            totalStripeSales: result.totalStripeSales,
            totalStripeFee: result.totalStripeFee,
            platformFee: result.platformFee,
            netPayoutAmount: result.netPayoutAmount,
          }
        );
      }

      return result;
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.CALCULATION_ERROR,
        "送金金額の計算に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 送金処理を実行する
   */
  async processPayout(params: ProcessPayoutParams): Promise<ProcessPayoutResult> {
    try {
      // 入力検証を最初に実施（バリデータが提供されている場合のみ）
      const validateProcessParams = this.validator?.validateProcessPayoutParams?.bind(this.validator);
      if (typeof validateProcessParams === "function") {
        await validateProcessParams(params);
      }

      const { eventId, userId } = params;

      // Stripe Connectアカウントの確認
      const connectAccount = await this.stripeConnectService.getConnectAccountByUser(userId);
      if (!connectAccount) {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントが設定されていません"
        );
      }

      if (!connectAccount.payouts_enabled) {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントで送金が有効になっていません"
        );
      }

      // 送金金額を計算
      const calculation = await this.calculatePayoutAmount(eventId);

      if (calculation.netPayoutAmount <= 0) {
        throw new PayoutError(
          PayoutErrorType.INSUFFICIENT_BALANCE,
          "送金可能な金額がありません"
        );
      }

      // 送金レコードを作成（RPC経由で原子的に作成・検証）
      const { data: createdPayoutId, error: rpcError } = await this.supabase
        .rpc("process_event_payout", { p_event_id: eventId, p_user_id: userId });

      if (rpcError) {
        const msg = (rpcError.message || "").toLowerCase();

        // 既存送金・一意制約
        if (
          (rpcError.code === "P0001" && (msg.includes("payout already exists") || msg.includes("already exists"))) ||
          rpcError.code === "23505"
        ) {
          throw new PayoutError(
            PayoutErrorType.PAYOUT_ALREADY_EXISTS,
            "このイベントの送金処理は既に実行済みです",
            rpcError
          );
        }

        // 入力不正
        if (msg.includes("cannot be null") || msg.includes("invalid input")) {
          throw new PayoutError(
            PayoutErrorType.VALIDATION_ERROR,
            "送金処理の入力が不正です",
            rpcError
          );
        }

        // イベント不存在 or 権限なし
        if (msg.includes("not found or user not authorized")) {
          throw new PayoutError(
            PayoutErrorType.FORBIDDEN,
            "このイベントの送金処理を実行する権限がありません",
            rpcError
          );
        }

        // Stripeアカウント未準備
        if (msg.includes("no verified stripe connect account")) {
          throw new PayoutError(
            PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
            "Stripe Connectアカウントの設定が完了していません",
            rpcError
          );
        }

        // 金額不足
        if (msg.includes("net payout amount must be positive")) {
          throw new PayoutError(
            PayoutErrorType.INSUFFICIENT_BALANCE,
            "送金可能な金額がありません",
            rpcError
          );
        }

        // デフォルト
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金レコードの作成に失敗しました: ${rpcError.message}`,
          rpcError
        );
      }

      const payoutId = createdPayoutId as unknown as string;

      // Stripe Transferを実行
      let transferId: string | null = null;
      let estimatedArrival: string | undefined;

      try {
        const transferParams = {
          amount: calculation.netPayoutAmount,
          currency: "jpy" as const,
          destination: connectAccount.stripe_account_id,
          metadata: {
            payout_id: payoutId,
            event_id: eventId,
            user_id: userId,
          },
          description: `EventPay payout for event ${eventId}`,
          transferGroup: getTransferGroupForEvent(eventId),
        };

        // 新しいStripeTransferServiceを使用
        const transferResult = await this.stripeTransferService.createTransfer(transferParams);

        transferId = transferResult.transferId;
        estimatedArrival = transferResult.estimatedArrival?.toISOString();

        // 送金レコードを更新（processing状態に）
        await this.updatePayoutStatus({
          payoutId: payoutId,
          status: "processing",
          stripeTransferId: transferId,
          transferGroup: getTransferGroupForEvent(eventId),
        });

      } catch (stripeError) {
        // Stripe Transfer失敗時は送金レコードをfailedに更新
        const errorMessage = stripeError instanceof PayoutError
          ? stripeError.message
          : (stripeError as Error).message;

        await this.updatePayoutStatus({
          payoutId: payoutId,
          status: "failed",
          lastError: errorMessage,
        });

        // PayoutErrorの場合はそのまま再スロー、それ以外は新しいPayoutErrorでラップ
        if (stripeError instanceof PayoutError) {
          throw stripeError;
        }

        throw new PayoutError(
          PayoutErrorType.TRANSFER_CREATION_FAILED,
          `Stripe Transferの作成に失敗しました: ${errorMessage}`,
          stripeError as Error
        );
      }

      return {
        payoutId: payoutId,
        transferId,
        netAmount: calculation.netPayoutAmount,
        estimatedArrival,
      };

    } catch (_error) {
      if (_error instanceof PayoutError) {
        throw _error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金処理の実行に失敗しました",
        _error as Error
      );
    }
  }

  /**
   * 送金履歴を取得する
   */
  async getPayoutHistory(params: GetPayoutHistoryParams): Promise<Payout[]> {
    try {
      const { userId, limit = 50, offset = 0, status, eventId } = params;

      let query = this.supabase
        .from("payouts")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }

      if (eventId) {
        query = query.eq("event_id", eventId);
      }

      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金履歴の取得に失敗しました: ${error.message}`,
          error
        );
      }

      return (data || []) as Payout[];
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金履歴の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 送金ステータスを更新する
   */
  async updatePayoutStatus(params: UpdatePayoutStatusParams): Promise<void> {
    try {
      // 状態遷移バリデーションが利用可能な場合のみ、現在のステータスを取得して検証
      const validateTransition = this.validator?.validateStatusTransition?.bind(this.validator);
      if (typeof validateTransition === "function") {
        const { data: currentRow, error: fetchError } = await this.supabase
          .from("payouts")
          .select("status")
          .eq("id", params.payoutId)
          .maybeSingle();

        if (fetchError) {
          throw new PayoutError(
            PayoutErrorType.DATABASE_ERROR,
            `送金レコードの取得に失敗しました: ${fetchError.message}`,
            fetchError
          );
        }

        if (!currentRow) {
          throw new PayoutError(
            PayoutErrorType.PAYOUT_NOT_FOUND,
            "指定された送金レコードが見つかりません"
          );
        }

        await validateTransition(
          (currentRow as { status: PayoutStatus }).status,
          params.status
        );
      }

      const updateData: {
        status: PayoutStatus;
        updated_at: string;
        processed_at?: string;
        stripe_transfer_id?: string;
        transfer_group?: string;
        last_error?: string;
        notes?: string;
      } = {
        status: params.status,
        updated_at: new Date().toISOString(),
      };

      if (params.processedAt) {
        updateData.processed_at = params.processedAt.toISOString();
      }

      if (params.stripeTransferId) {
        updateData.stripe_transfer_id = params.stripeTransferId;
      }

      if (params.transferGroup) {
        updateData.transfer_group = params.transferGroup;
      }

      if (params.lastError) {
        updateData.last_error = params.lastError;
      }

      if (params.notes) {
        updateData.notes = params.notes;
      }

      const { data, error } = await this.supabase
        .from("payouts")
        .update(updateData)
        .eq("id", params.payoutId)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金ステータスの更新に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data) {
        throw new PayoutError(
          PayoutErrorType.PAYOUT_NOT_FOUND,
          "指定された送金レコードが見つかりません"
        );
      }
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金ステータスの更新に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 送金レコードを取得する
   */
  async getPayoutById(payoutId: string): Promise<Payout | null> {
    try {
      const { data, error } = await this.supabase
        .from("payouts")
        .select("*")
        .eq("id", payoutId)
        .maybeSingle();

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金レコードの取得に失敗しました: ${error.message}`,
          error
        );
      }

      return data as Payout | null;
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金レコードの取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * イベントの送金レコードを取得する
   */
  async getPayoutByEvent(eventId: string, userId: string): Promise<Payout | null> {
    try {
      const { data, error } = await this.supabase
        .from("payouts")
        .select("*")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金レコードの取得に失敗しました: ${error.message}`,
          error
        );
      }

      return data as Payout | null;
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金レコードの取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 送金処理を再実行する
   */
  async retryPayout(payoutId: string): Promise<ProcessPayoutResult> {
    try {
      const payout = await this.getPayoutById(payoutId);
      if (!payout) {
        throw new PayoutError(
          PayoutErrorType.PAYOUT_NOT_FOUND,
          "指定された送金レコードが見つかりません"
        );
      }

      if (payout.status !== "failed") {
        throw new PayoutError(
          PayoutErrorType.INVALID_STATUS_TRANSITION,
          "失敗状態の送金のみ再実行可能です"
        );
      }

      // 再実行として新しい送金処理を実行
      return await this.processPayout({
        eventId: payout.event_id,
        userId: payout.user_id,
        notes: `再実行: ${payout.notes || ""}`,
      });

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金処理の再実行に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 詳細な送金金額計算を実行する（管理者・デバッグ用）
   */
  async calculateDetailedPayoutAmount(eventId: string): Promise<import("./calculation").DetailedPayoutCalculation> {
    try {
      // イベントのStripe決済データを取得
      const { data: paymentsData, error } = await this.supabase
        .from("payments")
        .select(`
          amount,
          method,
          status,
          attendances!inner (
            event_id
          )
        `)
        .eq("attendances.event_id", eventId)
        .eq("method", "stripe")
        .eq("status", "paid");

      if (error) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `決済データの取得に失敗しました: ${error.message}`,
          error
        );
      }

      // 決済データを計算用の形式に変換
      const payments = (paymentsData || []).map(p => ({
        amount: p.amount,
        method: p.method,
        status: p.status,
      }));

      // 詳細計算を実行
      const calculator = new PayoutCalculator(this.stripeFeeConfig, this.platformFeeConfig);
      return calculator.calculateDetailedPayout(payments);

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.CALCULATION_ERROR,
        "詳細送金金額の計算に失敗しました",
        error as Error
      );
    }
  }

  /**
   * Stripe Transfer情報を取得する
   * @param transferId Transfer ID
   * @returns Transfer情報
   * @throws PayoutError Transfer取得に失敗した場合
   */
  async getTransferInfo(transferId: string): Promise<{
    id: string;
    amount: number;
    destination: string;
    status: string;
    created: Date;
    metadata: Record<string, string>;
  }> {
    try {
      const transfer = await this.stripeTransferService.getTransfer(transferId);

      return {
        id: transfer.id,
        amount: transfer.amount,
        destination: transfer.destination as string,
        status: (transfer as unknown as { status?: string }).status ?? "pending",
        created: new Date(transfer.created * 1000),
        metadata: transfer.metadata || {},
      };
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.STRIPE_API_ERROR,
        "Transfer情報の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * Stripe Transferをキャンセルする（可能な場合）
   * @param payoutId 送金ID
   * @returns キャンセル結果
   * @throws PayoutError キャンセルに失敗した場合
   */
  async cancelTransfer(payoutId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      // 送金レコードを取得
      const payout = await this.getPayoutById(payoutId);
      if (!payout) {
        throw new PayoutError(
          PayoutErrorType.PAYOUT_NOT_FOUND,
          "指定された送金レコードが見つかりません"
        );
      }

      // キャンセル可能な状態かチェック
      if (payout.status !== "processing") {
        throw new PayoutError(
          PayoutErrorType.INVALID_STATUS_TRANSITION,
          "処理中の送金のみキャンセル可能です"
        );
      }

      if (!payout.stripe_transfer_id) {
        throw new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          "Stripe Transfer IDが見つかりません"
        );
      }

      // Stripe Transferをキャンセル（Reversalを作成）
      await this.stripeTransferService.cancelTransfer(payout.stripe_transfer_id);

      // 送金レコードを更新
      await this.updatePayoutStatus({
        payoutId: payoutId,
        status: "failed",
        lastError: "Transfer cancelled by user",
        notes: "Transfer cancelled via reversal",
      });

      return {
        success: true,
        message: "送金がキャンセルされました",
      };

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.STRIPE_API_ERROR,
        "送金のキャンセルに失敗しました",
        error as Error
      );
    }
  }

  /**
   * 送金可能性をチェックする
   */
  async checkPayoutEligibility(eventId: string, userId: string): Promise<{
    eligible: boolean;
    reason?: string;
    estimatedAmount?: number;
  }> {
    try {
      // イベントの存在確認
      const { data: event, error: eventError } = await this.supabase
        .from("events")
        .select("id, title, date, created_by, status")
        .eq("id", eventId)
        .eq("created_by", userId)
        .single();

      if (eventError || !event) {
        return {
          eligible: false,
          reason: "イベントが見つからないか、アクセス権限がありません",
        };
      }

      // イベント終了から5日経過チェック（JST暦日差）
      if (!hasElapsedDaysInJst(event.date, 5)) {
        return {
          eligible: false,
          reason: "イベント終了から5日経過していません",
        };
      }

      // 既存の送金レコードチェック
      const existingPayout = await this.getPayoutByEvent(eventId, userId);
      if (existingPayout) {
        return {
          eligible: false,
          reason: "既に送金処理が実行済みです",
        };
      }

      // Stripe Connectアカウントチェック
      const connectAccount = await this.stripeConnectService.getConnectAccountByUser(userId);
      if (!connectAccount || !connectAccount.payouts_enabled) {
        return {
          eligible: false,
          reason: "Stripe Connectアカウントの設定が完了していません",
        };
      }

      // 送金金額計算
      const calculation = await this.calculatePayoutAmount(eventId);
      if (calculation.netPayoutAmount <= 0) {
        return {
          eligible: false,
          reason: "送金可能な金額がありません",
          estimatedAmount: 0,
        };
      }

      return {
        eligible: true,
        estimatedAmount: calculation.netPayoutAmount,
      };

    } catch (_error) {
      return {
        eligible: false,
        reason: "送金可能性の確認中にエラーが発生しました",
      };
    }
  }

  /**
   * 手動送金実行条件を検証する
   * PayoutValidatorに委譲して包括的な検証を実行
   */
  async validateManualPayoutEligibility(params: ValidateManualPayoutParams): Promise<ManualPayoutEligibilityResult> {
    try {
      return await this.validator.validateManualPayoutEligibility(params);
    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "手動送金実行条件の検証に失敗しました",
        error as Error
      );
    }
  }
}
