/**
 * PayoutValidator の実装
 */

import { type SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { IPayoutValidator } from "./interface";
import { getElapsedCalendarDaysInJst } from "@/lib/utils/timezone";
import { IStripeConnectService } from "../stripe-connect/interface";
import {
  ProcessPayoutParams,
  PayoutError,
  PayoutErrorType,
  PayoutStatus,
  ValidateManualPayoutParams,
  ManualPayoutEligibilityResult,
} from "./types";
import { MAX_PAYOUT_AMOUNT } from "./constants";
import { FeeConfigService } from "../fee-config/service";
// PayoutCalculator は削除 - RPC の calc_total_stripe_fee() を使用

/**
 * PayoutValidatorの実装クラス
 */
export class PayoutValidator implements IPayoutValidator {
  private supabase: SupabaseClient<Database>;
  private stripeConnectService: IStripeConnectService;
  private feeConfigService: FeeConfigService;

  constructor(
    supabaseClient: SupabaseClient<Database>,
    stripeConnectService: IStripeConnectService
  ) {
    this.supabase = supabaseClient;
    this.stripeConnectService = stripeConnectService;
    this.feeConfigService = new FeeConfigService(supabaseClient);
  }

  /**
   * 送金処理パラメータを検証する
   */
  async validateProcessPayoutParams(params: ProcessPayoutParams): Promise<void> {
    const { eventId, userId, notes } = params;

    // 必須パラメータチェック
    if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "イベントIDが指定されていません"
      );
    }

    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "ユーザーIDが指定されていません"
      );
    }

    // UUID形式チェック
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(eventId)) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "イベントIDの形式が正しくありません"
      );
    }

    if (!uuidRegex.test(userId)) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "ユーザーIDの形式が正しくありません"
      );
    }

    // notesの長さチェック（1000文字以内）
    if (notes && notes.length > 1000) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "備考は1000文字以内で入力してください"
      );
    }
  }

  /**
   * イベントの送金対象性を検証する
   */
  async validateEventEligibility(eventId: string, userId: string): Promise<void> {
    try {
      // イベントの存在と権限確認
      const { data: event, error: eventError } = await this.supabase
        .from("events")
        .select("id, title, date, created_by, status")
        .eq("id", eventId)
        .single();

      if (eventError) {
        if (eventError.code === "PGRST116") { // No rows returned
          throw new PayoutError(
            PayoutErrorType.EVENT_NOT_FOUND,
            "指定されたイベントが見つかりません"
          );
        }
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `イベント情報の取得に失敗しました: ${eventError.message}`,
          eventError
        );
      }

      // 主催者権限チェック
      if (event.created_by !== userId) {
        throw new PayoutError(
          PayoutErrorType.FORBIDDEN,
          "このイベントの送金処理を実行する権限がありません"
        );
      }

      // イベントステータスチェック（送金対象は終了済みイベント）
      if (event.status !== "past") {
        throw new PayoutError(
          PayoutErrorType.EVENT_NOT_ELIGIBLE,
          "終了済みでないイベントは送金対象外です"
        );
      }

      // イベント終了から5日経過チェック（JST暦日差）
      const elapsedDays = getElapsedCalendarDaysInJst(event.date);
      if (elapsedDays < 5) {
        const daysRemaining = 5 - elapsedDays;
        throw new PayoutError(
          PayoutErrorType.EVENT_NOT_ELIGIBLE,
          `イベント終了から5日経過していません。あと${daysRemaining}日お待ちください。`
        );
      }

      // 既存の送金レコードチェック
      const { data: existingPayout, error: payoutError } = await this.supabase
        .from("payouts")
        .select("id, status")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();

      if (payoutError) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `既存送金レコードの確認に失敗しました: ${payoutError.message}`,
          payoutError
        );
      }

      if (existingPayout) {
        throw new PayoutError(
          PayoutErrorType.PAYOUT_ALREADY_EXISTS,
          `このイベントの送金処理は既に実行済みです（ステータス: ${existingPayout.status}）`
        );
      }

      // Stripe決済の存在チェック
      const { data: stripePayments, error: paymentsError } = await this.supabase
        .from("payments")
        .select(`
          id,
          amount,
          attendances!inner (
            event_id
          )
        `)
        .eq("attendances.event_id", eventId)
        .eq("method", "stripe")
        .eq("status", "paid");

      if (paymentsError) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `決済データの確認に失敗しました: ${paymentsError.message}`,
          paymentsError
        );
      }

      if (!stripePayments || stripePayments.length === 0) {
        throw new PayoutError(
          PayoutErrorType.EVENT_NOT_ELIGIBLE,
          "このイベントには送金対象となるStripe決済がありません"
        );
      }

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "イベントの送金対象性検証に失敗しました",
        error as Error
      );
    }
  }

  /**
   * Stripe Connectアカウントの送金可能性を検証する
   */
  async validateStripeConnectAccount(userId: string): Promise<void> {
    try {
      const connectAccount = await this.stripeConnectService.getConnectAccountByUser(userId);

      if (!connectAccount) {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントが設定されていません。アカウント設定を完了してください。"
        );
      }

      if (connectAccount.status !== "verified") {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントの認証が完了していません。オンボーディングを完了してください。"
        );
      }


      if (!connectAccount.payouts_enabled) {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントで送金が有効になっていません。"
        );
      }

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.STRIPE_CONNECT_ERROR,
        "Stripe Connectアカウントの検証に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 送金金額の妥当性を検証する
   */
  async validatePayoutAmount(amount: number): Promise<void> {
    // 数値チェック
    if (typeof amount !== "number" || isNaN(amount) || !isFinite(amount)) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "送金金額は有効な数値である必要があります"
      );
    }

    // 正の値チェック
    if (amount <= 0) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "送金金額は0円より大きい必要があります"
      );
    }

    // 整数チェック（円単位）
    if (!Number.isInteger(amount)) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "送金金額は円単位の整数である必要があります"
      );
    }

    // 最小金額取得 (キャッシュ付き)
    const { minPayoutAmount } = await this.feeConfigService.getConfig();

    // 最小金額チェック
    if (amount < minPayoutAmount) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        `送金金額は${minPayoutAmount}円以上である必要があります`
      );
    }

    // 最大金額チェック
    if (amount > MAX_PAYOUT_AMOUNT) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        `送金金額は${MAX_PAYOUT_AMOUNT.toLocaleString()}円以下である必要があります`
      );
    }
  }

  /**
   * 送金ステータス遷移の妥当性を検証する
   */
  async validateStatusTransition(currentStatus: string, newStatus: string): Promise<void> {
    const validTransitions: Record<PayoutStatus, PayoutStatus[]> = {
      pending: ["processing", "failed"],
      processing: ["completed", "failed", "processing_error"],
      completed: [], // 完了状態からは遷移不可
      failed: ["pending", "processing"], // 失敗状態からは再試行でpendingまたはprocessingに遷移可能
      processing_error: ["pending", "processing"], // エラー状態からは再試行可能
    };

    const current = currentStatus as PayoutStatus;
    const next = newStatus as PayoutStatus;

    // 現在のステータスが有効かチェック
    if (!validTransitions.hasOwnProperty(current)) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        `無効な現在のステータスです: ${currentStatus}`
      );
    }

    // 新しいステータスが有効かチェック
    if (!Object.values(validTransitions).flat().includes(next) && next !== current) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        `無効な新しいステータスです: ${newStatus}`
      );
    }

    // 同じステータスへの遷移は許可
    if (current === next) {
      return;
    }

    // 遷移可能性チェック
    if (!validTransitions[current].includes(next)) {
      throw new PayoutError(
        PayoutErrorType.INVALID_STATUS_TRANSITION,
        `${currentStatus} から ${newStatus} への遷移は許可されていません`
      );
    }
  }

  /**
   * 手動送金実行条件を検証する
   * 要件8.1-8.4に基づく包括的な検証を実行
   */
  async validateManualPayoutEligibility(params: ValidateManualPayoutParams): Promise<ManualPayoutEligibilityResult> {
    const {
      eventId,
      userId,
      minimumAmount,
      daysAfterEvent = 5,
    } = params;

    // 最小送金額（デフォルト）を取得
    const { minPayoutAmount } = await this.feeConfigService.getConfig();

    const effectiveMinAmount = minimumAmount ?? minPayoutAmount;

    const result: ManualPayoutEligibilityResult = {
      eligible: false,
      reasons: [],
      details: {
        eventEndedCheck: false,
        autoPayoutScheduled: false,
        autoPayoutOverdue: false,
        autoPayoutFailed: false,
        stripeAccountReady: false,
        payoutsEnabled: false,
        minimumAmountMet: false,
        duplicatePayoutExists: false,
      },
    };

    try {
      // 1. イベント基本情報の取得と権限確認
      const { data: event, error: eventError } = await this.supabase
        .from("events")
        .select("id, title, date, created_by, status")
        .eq("id", eventId)
        .single();

      if (eventError || !event) {
        result.reasons.push("イベントが見つからないか、アクセス権限がありません");
        return result;
      }

      if (event.created_by !== userId) {
        result.reasons.push("このイベントの送金処理を実行する権限がありません");
        return result;
      }

      if (event.status !== "past") {
        result.reasons.push("終了済みでないイベントは送金対象外です");
        return result;
      }

      // 2. イベント終了5日経過の検証（JST暦日差）
      const daysDiff = getElapsedCalendarDaysInJst(event.date);
      result.details.eventEndedDaysAgo = daysDiff as unknown as number; // 型整合のため数値に限定
      result.details.eventEndedCheck = daysDiff >= daysAfterEvent;
      if (!result.details.eventEndedCheck) {
        const daysRemaining = daysAfterEvent - daysDiff;
        result.reasons.push(`イベント終了から${daysAfterEvent}日経過していません。あと${daysRemaining}日お待ちください。`);
      }

      // 3. 既存送金レコードの確認（重複送金防止・自動送金状況確認）（要件8.1, 8.3）
      const { data: existingPayout, error: payoutError } = await this.supabase
        .from("payouts")
        .select("id, status, created_at, processed_at")
        .eq("event_id", eventId)
        .eq("user_id", userId)
        .maybeSingle();

      if (payoutError) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `既存送金レコードの確認に失敗しました: ${payoutError.message}`,
          payoutError
        );
      }

      if (existingPayout) {
        result.details.duplicatePayoutExists = true;
        result.details.existingPayoutStatus = existingPayout.status as PayoutStatus;
        result.details.autoPayoutScheduled = true;

        // 自動送金の状況に応じた判定
        if (existingPayout.status === "completed") {
          result.reasons.push("このイベントの送金処理は既に完了済みです");
          return result;
        } else if (existingPayout.status === "processing") {
          result.reasons.push("このイベントの送金処理は現在実行中です");
          return result;
        } else if (existingPayout.status === "failed") {
          // 失敗状態の場合は手動送金を許可
          result.details.autoPayoutFailed = true;
        } else if (existingPayout.status === "pending") {
          // pending状態で予定日（JST暦日差ベース）を過ぎている場合は手動送金を許可
          const isOverdue = getElapsedCalendarDaysInJst(event.date) >= daysAfterEvent;
          result.details.autoPayoutOverdue = isOverdue;

          if (!isOverdue) {
            result.reasons.push("自動送金の予定日がまだ到来していません");
          }
        }
      } else {
        // 既存送金レコードがない場合、イベント終了5日経過していれば手動送金可能
        result.details.autoPayoutScheduled = false;
      }

      // 4. Stripe Connectアカウント状態の検証（要件8.2）
      try {
        const connectAccount = await this.stripeConnectService.getConnectAccountByUser(userId);

        if (!connectAccount) {
          result.reasons.push("Stripe Connectアカウントが設定されていません");
        } else {
          result.details.stripeAccountStatus = connectAccount.status;
          result.details.stripeAccountReady = connectAccount.status === "verified";
          result.details.payoutsEnabled = connectAccount.payouts_enabled;

          if (connectAccount.status !== "verified") {
            result.reasons.push("Stripe Connectアカウントの認証が完了していません");
          }

          // charges_enabled は Destination Charges では必須ではないためスキップ

          if (!connectAccount.payouts_enabled) {
            result.reasons.push("Stripe Connectアカウントで送金が有効になっていません");
          }
        }
      } catch (_stripeError) {
        result.reasons.push("Stripe Connectアカウントの状態確認に失敗しました");
      }

      // 5. 送金対象金額の検証（要件8.3）
      try {
        // Stripe決済の売上を取得（決済データは後で計算にそのまま渡す）
        const { data: stripePayments, error: paymentsError } = await this.supabase
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

        if (paymentsError) {
          throw new PayoutError(
            PayoutErrorType.DATABASE_ERROR,
            `決済データの取得に失敗しました: ${paymentsError.message}`,
            paymentsError
          );
        }

        // ---- RPC による手数料計算 ----
        // Stripe売上の集計
        const totalStripeSales = (stripePayments || []).reduce((sum: number, p: any) => sum + p.amount, 0);

        // Stripe手数料は calc_total_stripe_fee() RPC で計算
        const { data: totalStripeFee, error: feeError } = await (this.supabase as any)
          .rpc("calc_total_stripe_fee", { p_event_id: eventId });

        if (feeError) {
          throw new PayoutError(
            PayoutErrorType.DATABASE_ERROR,
            `Stripe手数料の計算に失敗しました: ${feeError.message}`,
            feeError
          );
        }

        // プラットフォーム手数料（現在は0）
        const platformFee = 0;
        const netPayoutAmount = totalStripeSales - (totalStripeFee || 0) - platformFee;

        const calculation = {
          totalStripeSales,
          totalStripeFee: totalStripeFee || 0,
          platformFee,
          netPayoutAmount,
        };

        result.details.estimatedAmount = calculation.netPayoutAmount;
        result.details.minimumAmountMet = calculation.netPayoutAmount >= effectiveMinAmount;

        if (calculation.totalStripeSales === 0) {
          result.reasons.push("このイベントには送金対象となるStripe決済がありません");
        } else if (!result.details.minimumAmountMet) {
          result.reasons.push(`送金金額が最小金額（${effectiveMinAmount}円）を下回っています（推定: ${calculation.netPayoutAmount}円）`);
        }
      } catch (_calculationError) {
        result.reasons.push("送金金額の計算に失敗しました");
      }

      // 6. 総合判定
      // 基本条件: イベント終了5日経過・Stripeアカウント準備完了・送金有効・最小金額到達
      const baseConditions =
        result.details.eventEndedCheck &&
        result.details.stripeAccountReady &&
        result.details.payoutsEnabled &&
        result.details.minimumAmountMet;

      // 重複送金条件: 重複なし、または重複があっても失敗/遅延している場合のみ許可
      const duplicateCondition =
        !result.details.duplicatePayoutExists ||
        (result.details.duplicatePayoutExists &&
          (result.details.autoPayoutFailed || result.details.autoPayoutOverdue));

      const canExecuteManualPayout = baseConditions && duplicateCondition;

      result.eligible = canExecuteManualPayout && result.reasons.length === 0;

      return result;

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
