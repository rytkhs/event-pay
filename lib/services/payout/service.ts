/**
 * PayoutServiceの基本実装
 */

import { type SupabaseClient } from "@supabase/supabase-js";
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
  AggregatePayoutError,

  ValidateManualPayoutParams,
  ManualPayoutEligibilityResult,
} from "./types";
import { hasElapsedDaysInJst } from "@/lib/utils/timezone";
import { getTransferGroupForEvent } from "@/lib/utils/stripe";
import { StripeTransferService } from "./stripe-transfer";
import { FeeConfigService } from "../fee-config/service";
import { logger } from "@/lib/logging/app-logger";
// MIN_PAYOUT_AMOUNT, isPayoutAmountEligible は削除済み

/**
 * PayoutServiceの実装クラス
 */
export class PayoutService implements IPayoutService {
  private supabase: SupabaseClient<Database>;
  private stripe = stripe;
  private errorHandler: IPayoutErrorHandler;
  private stripeConnectService: IStripeConnectService;
  private stripeTransferService: StripeTransferService;
  private validator: IPayoutValidator;
  private feeConfigService: FeeConfigService;

  // コンストラクタ
  constructor(
    supabaseClient: SupabaseClient<Database>,
    errorHandler: IPayoutErrorHandler,
    stripeConnectService: IStripeConnectService,
    validator: IPayoutValidator,
    stripeTransferService?: StripeTransferService
  ) {
    this.supabase = supabaseClient;
    this.errorHandler = errorHandler;
    this.stripeConnectService = stripeConnectService;
    this.validator = validator;
    this.stripeTransferService = stripeTransferService || new StripeTransferService();
    this.feeConfigService = new FeeConfigService(supabaseClient);
  }

  // loadFeeConfigIfNeeded は削除 - FeeConfigService を使用

  /**
   * 送金対象イベントを検索する
   */
  async findEligibleEvents(params: FindEligibleEventsParams = {}): Promise<EligibleEvent[]> {
    try {
      // FeeConfigServiceから最小送金額を取得
      const { minPayoutAmount } = await this.feeConfigService.getConfig();

      const {
        daysAfterEvent = 5,
        minimumAmount = minPayoutAmount,
        userId,
        limit = 50,
      } = params;

      // find_eligible_events_basic RPC を権威データとして使用
      const { data: rpcData, error: rpcErr } = await (this.supabase as any).rpc(
        "find_eligible_events_basic",
        {
          p_days_after_event: daysAfterEvent,
          p_minimum_amount: minimumAmount,
          p_limit: limit,
          p_user_id: userId ?? null,
        }
      );

      if (rpcErr) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金対象イベントの検索に失敗しました: ${rpcErr.message}`,
          rpcErr
        );
      }

      if (!Array.isArray(rpcData)) {
        return [];
      }

      return (rpcData as any[]).map((r) => ({
        id: r.event_id,
        title: r.title,
        date: r.event_date,
        fee: r.fee,
        created_by: r.created_by,
        created_at: r.created_at,
        paid_attendances_count: r.paid_attendances_count,
        total_stripe_sales: r.total_stripe_sales,
      })) as EligibleEvent[];

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      throw new PayoutError(
        PayoutErrorType.DATABASE_ERROR,
        "送金対象イベントの検索中にエラーが発生しました",
        error as Error
      );
    }
  }

  // loadEligibleEventsFromDB は削除 - RPC のみ使用



  /**
   * 送金金額を計算する
   */
  async calculatePayoutAmount(eventId: string): Promise<PayoutCalculation> {
    try {
      // 新RPC calc_payout_amount で売上・手数料・件数を一括取得
      const { data: rpcRow, error: rpcError } = await (this.supabase as any)
        .rpc("calc_payout_amount", { p_event_id: eventId })
        .single();

      if (rpcError) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金金額の計算に失敗しました: ${rpcError.message}`,
          rpcError
        );
      }

      const row = rpcRow as
        | {
          total_stripe_sales: number | null;
          total_stripe_fee: number | null;
          platform_fee: number | null;
          net_payout_amount: number | null;
          stripe_payment_count: number | null;
        }
        | null;

      // デフォルト値を補完
      const totalStripeSales = row?.total_stripe_sales ?? 0;
      const totalStripeFee = row?.total_stripe_fee ?? 0;
      const platformFee = row?.platform_fee ?? 0;
      const netPayoutAmount = row?.net_payout_amount ?? 0;
      const stripePaymentCount = row?.stripe_payment_count ?? 0;

      // バリデーション: 負の値チェック
      if (netPayoutAmount < 0) {
        throw new PayoutError(
          PayoutErrorType.CALCULATION_ERROR,
          "送金金額の計算結果が負の値になりました。手数料設定を確認してください。",
          undefined,
          {
            totalStripeSales,
            totalStripeFee,
            platformFee,
            netPayoutAmount,
          }
        );
      }

      const result: PayoutCalculation = {
        totalStripeSales,
        totalStripeFee,
        platformFee,
        netPayoutAmount,
        breakdown: {
          stripePaymentCount,
          averageTransactionAmount:
            stripePaymentCount > 0 ? Math.round(totalStripeSales / stripePaymentCount) : 0,
          stripeFeeRate: 0, // 詳細は RPC では返さない
          platformFeeRate: 0,
        },
      };

      // 最小送金額チェック
      const { minPayoutAmount } = await this.feeConfigService.getConfig();
      if (result.netPayoutAmount < minPayoutAmount) {
        throw new PayoutError(
          PayoutErrorType.INSUFFICIENT_BALANCE,
          "送金可能な金額がありません"
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

      // Stripe Connect アカウントの総合バリデーション（status / chargesEnabled / payoutsEnabled）
      const validateStripeAccount = this.validator?.validateStripeConnectAccount?.bind(this.validator);
      if (typeof validateStripeAccount === "function") {
        await validateStripeAccount(params.userId);
      }

      const { eventId, userId } = params;

      const { minPayoutAmount } = await this.feeConfigService.getConfig();

      // Stripe Connectアカウントの確認
      const connectAccount = await this.stripeConnectService.getConnectAccountByUser(userId);
      if (!connectAccount) {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントが設定されていません"
        );
      }

      // フェイルセーフ: バリデーション後にアカウント状態が変化していないか再確認
      // charges_enabled と payouts_enabled の双方が true であることを保証する
      if (!(connectAccount.charges_enabled && connectAccount.payouts_enabled)) {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントの決済または送金が有効になっていません"
        );
      }

      // 送金金額を計算
      const calculation = await this.calculatePayoutAmount(eventId);

      // 最小送金額チェック（FeeConfig は既に取得済み）
      if (calculation.netPayoutAmount < minPayoutAmount) {
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

      // DB確定値を取得して送金金額に使用
      const { data: payoutRow, error: fetchPayoutError } = await this.supabase
        .from("payouts")
        .select("id, net_payout_amount")
        .eq("id", payoutId)
        .maybeSingle();

      if (fetchPayoutError) {
        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金レコードの取得に失敗しました: ${fetchPayoutError.message}`,
          fetchPayoutError
        );
      }

      if (!payoutRow) {
        throw new PayoutError(
          PayoutErrorType.PAYOUT_NOT_FOUND,
          "作成された送金レコードが見つかりません"
        );
      }

      // ------------------------------
      // 最小送金額の2段階チェック
      // RPC 側で get_min_payout_amount() による検証があるが、
      // JS と SQL で設定が乖離しないよう再検証を行う。
      // ------------------------------
      // 2段階目の最小送金額チェックも同一変数を利用
      if (payoutRow.net_payout_amount < minPayoutAmount) {
        // 送金レコードを failed に更新
        try {
          await this.updatePayoutStatus({
            payoutId: payoutId,
            status: "failed",
            lastError: `送金金額が最小金額を下回っています (${payoutRow.net_payout_amount}円)`,
          });
        } catch (_) {
          // ステータス更新失敗はログのみ（上位で再試行される想定）
        }

        throw new PayoutError(
          PayoutErrorType.INSUFFICIENT_BALANCE,
          "送金金額が最小金額を下回っているため Stripe Transfer を中止しました"
        );
      }

      // Stripe Transferを実行
      let transferId: string | null = null;
      let estimatedArrival: string | undefined;
      let rateLimitInfo: any = undefined;

      try {
        const transferParams = {
          amount: payoutRow.net_payout_amount,
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
        rateLimitInfo = transferResult.rateLimitInfo;

        // 送金レコードを更新（processing状態に）
        // Webhook 先着で既に completed になっている可能性があるためガードを入れる
        try {
          await this.updatePayoutStatus({
            payoutId: payoutId,
            status: "processing",
            stripeTransferId: transferId,
            transferGroup: getTransferGroupForEvent(eventId),
          });
        } catch (updateErr) {
          // すでに Webhook が completed に遷移させていた場合は処理成功として許容
          if (
            updateErr instanceof PayoutError &&
            updateErr.type === PayoutErrorType.INVALID_STATUS_TRANSITION
          ) {
            const latest = await this.getPayoutById(payoutId);
            if (latest && latest.status === "completed") {
              // 競合により完了済み。エラーを無視して続行
            } else {
              throw updateErr;
            }
          } else {
            // Transfer成功後のDB更新失敗 -> processing_errorに設定
            // Webhookによる最終的整合性に期待し、failedには落とさない
            try {
              await this.updatePayoutStatus({
                payoutId: payoutId,
                status: "processing_error",
                stripeTransferId: transferId,
                transferGroup: getTransferGroupForEvent(eventId),
                lastError: `Transfer成功後のDB更新失敗: ${updateErr instanceof Error ? updateErr.message : String(updateErr)}`,
                notes: "Webhook処理による自動復旧待ち",
              });

              // processing_errorステータス設定成功時は、処理成功として返す
              // Webhookで最終的にcompletedに更新される
              logger.warn("Failed to update the database after transfer, recording as processing_error", {
                tag: "payoutDbUpdateFailedAfterTransfer",
                payout_id: payoutId,
                transfer_id: transferId,
                error_message: updateErr instanceof Error ? updateErr.message : String(updateErr)
              });
            } catch (secondUpdateErr) {
              // Throw AggregatePayoutError only if setting processing_error also fails
              logger.error("Failed to set processing_error", {
                tag: "payoutProcessingErrorUpdateFailed",
                payout_id: payoutId,
                transfer_id: transferId,
                original_error: updateErr instanceof Error ? updateErr.message : String(updateErr),
                secondUpdateError: secondUpdateErr,
              });

              throw new AggregatePayoutError(
                updateErr instanceof Error ? updateErr : new Error(String(updateErr)),
                secondUpdateErr as Error
              );
            }
          }
        }

      } catch (stripeError) {
        // Stripe Transfer失敗時は送金レコードをfailedに更新。
        const errorMessage =
          stripeError instanceof PayoutError
            ? stripeError.message
            : (stripeError as Error).message;

        try {
          await this.updatePayoutStatus({
            payoutId: payoutId,
            status: "failed",
            lastError: errorMessage,
          });
        } catch (updateErr) {
          // ステータス更新に失敗した場合は複合エラーとして再throw
          logger.error("updatePayoutStatus failed", {
            tag: "payoutStatusUpdateFailed",
            payout_id: payoutId,
            stripe_error: stripeError instanceof Error ? stripeError.message : String(stripeError),
            update_error: updateErr instanceof Error ? updateErr.message : String(updateErr),
          });

          throw new AggregatePayoutError(
            stripeError instanceof Error
              ? stripeError
              : new Error(String(stripeError)),
            updateErr as Error
          );
        }

        // update 成功時は従来通りエラーを再送出
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
        netAmount: payoutRow.net_payout_amount,
        estimatedArrival,
        rateLimitInfo,
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
      // 現在ステータス取得（楽観ロック & バリデーション用）
      const { data: statusRow, error: fetchError } = await this.supabase
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

      if (!statusRow) {
        throw new PayoutError(
          PayoutErrorType.PAYOUT_NOT_FOUND,
          "指定された送金レコードが見つかりません"
        );
      }

      const currentStatus = (statusRow as { status: PayoutStatus }).status;

      // 状態遷移バリデーション（存在する場合のみ）
      if (typeof validateTransition === "function") {
        await validateTransition(currentStatus, params.status);
      }

      // --- ここから RPC 化による TOCTOU 対策 ---
      const rpcPayload = {
        _payout_id: params.payoutId,
        _from_status: currentStatus,
        _to_status: params.status,
        _processed_at: params.processedAt ? params.processedAt.toISOString() : null,
        _stripe_transfer_id: params.stripeTransferId ?? null,
        _transfer_group: params.transferGroup ?? null,
        _last_error: params.lastError ?? null,
        _notes: params.notes ?? null,
      };

      const { error: rpcError } = await (this.supabase as any).rpc(
        "update_payout_status_safe",
        rpcPayload
      );

      if (rpcError) {
        // 競合エラーを特定
        if (rpcError.code === "40001") {
          throw new PayoutError(
            PayoutErrorType.INVALID_STATUS_TRANSITION,
            "送金ステータスが競合しました。他プロセスで更新された可能性があります。",
            rpcError
          );
        }

        throw new PayoutError(
          PayoutErrorType.DATABASE_ERROR,
          `送金ステータスの更新に失敗しました: ${rpcError.message}`,
          rpcError
        );
      }
      // --- RPC 化ここまで ---
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
      // 既存 payout レコード取得
      const payout = await this.getPayoutById(payoutId);
      if (!payout) {
        throw new PayoutError(
          PayoutErrorType.PAYOUT_NOT_FOUND,
          "指定された送金レコードが見つかりません"
        );
      }

      if (payout.status !== "failed" && payout.status !== "pending") {
        throw new PayoutError(
          PayoutErrorType.INVALID_STATUS_TRANSITION,
          "失敗または保留状態の送金のみ再実行可能です"
        );
      }

      // pending で既に Stripe Transfer が存在する場合は再処理不要と判断
      if (payout.status === "pending" && payout.stripe_transfer_id) {
        return {
          payoutId: payout.id,
          transferId: payout.stripe_transfer_id,
          netAmount: payout.net_payout_amount,
          estimatedArrival: undefined,
        };
      }

      // Stripe Connect アカウントの総合バリデーション
      const validateStripeAccount = this.validator?.validateStripeConnectAccount?.bind(this.validator);
      if (typeof validateStripeAccount === "function") {
        await validateStripeAccount(payout.user_id);
      }

      const connectAccount = await this.stripeConnectService.getConnectAccountByUser(
        payout.user_id
      );
      // validateStripeConnectAccount で網羅チェック済みだが、null 念のためガード
      if (!connectAccount) {
        throw new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "Stripe Connectアカウントが取得できませんでした"
        );
      }

      // failed -> processing へ遷移 (last_error クリア)
      await this.updatePayoutStatus({
        payoutId,
        status: "processing",
        lastError: undefined,
        notes: `手動リトライ実行: ${payout.notes || ""}`,
      });

      const transferParams = {
        amount: payout.net_payout_amount,
        currency: "jpy" as const,
        destination: connectAccount.stripe_account_id,
        metadata: {
          payout_id: payout.id,
          event_id: payout.event_id,
          user_id: payout.user_id,
        },
        description: `EventPay payout retry for event ${payout.event_id}`,
        transferGroup: getTransferGroupForEvent(payout.event_id),
      } as const;

      let transferId: string | null = null;
      let estimatedArrival: string | undefined;
      let rateLimitInfo: any = undefined;

      try {
        const transferResult = await this.stripeTransferService.createTransfer(
          transferParams
        );

        transferId = transferResult.transferId;
        estimatedArrival = transferResult.estimatedArrival?.toISOString();
        rateLimitInfo = transferResult.rateLimitInfo;

        // processing 状態は既に設定済み。transfer 情報だけ上書き
        await this.updatePayoutStatus({
          payoutId,
          status: "processing",
          stripeTransferId: transferId,
          transferGroup: getTransferGroupForEvent(payout.event_id),
        });

      } catch (stripeError) {
        const errorMessage =
          stripeError instanceof PayoutError
            ? stripeError.message
            : (stripeError as Error).message;

        // 失敗したら failed に戻す
        await this.updatePayoutStatus({
          payoutId,
          status: "failed",
          lastError: errorMessage,
        });

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
        payoutId,
        transferId,
        netAmount: payout.net_payout_amount,
        estimatedArrival,
        rateLimitInfo,
      };

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
  async calculateDetailedPayoutAmount(eventId: string): Promise<import("./types").DetailedPayoutCalculation> {
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

      // Stripe決済のみを抽出
      const stripePayments = payments.filter(p => p.method === "stripe" && p.status === "paid");

      // Stripe売上の集計
      const totalStripeSales = stripePayments.reduce((sum: number, p: any) => sum + p.amount, 0);

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

      // 詳細な計算結果を返す
      return {
        totalStripeSales,
        totalStripeFee: totalStripeFee || 0,
        platformFee,
        netPayoutAmount,
        breakdown: {
          stripePaymentCount: stripePayments.length,
          averageTransactionAmount: stripePayments.length > 0 ? Math.round(totalStripeSales / stripePayments.length) : 0,
          stripeFeeRate: 0, // RPC計算なので割合は不明
          platformFeeRate: 0,
          stripeFeeBreakdown: [], // RPC計算なので個別詳細は不明
          platformFeeBreakdown: {
            rateFee: 0,
            fixedFee: 0,
            minimumFeeApplied: false,
            maximumFeeApplied: false,
          },
        },
        validation: {
          isValid: netPayoutAmount >= 0,
          warnings: netPayoutAmount < 100 ? ["送金金額が最小金額を下回る可能性があります"] : [],
          errors: netPayoutAmount < 0 ? ["純送金額が負の値になりました"] : [],
        },
      };

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

      // Stripe Connectアカウントチェック（Validatorに委譲）
      try {
        const validateStripeAccount = this.validator?.validateStripeConnectAccount?.bind(this.validator);
        if (typeof validateStripeAccount === "function") {
          await validateStripeAccount(userId);
        } else {
          // フォールバック: 簡易チェック
          const isReady = await this.stripeConnectService.isAccountReadyForPayout?.(userId);
          if (!isReady) {
            return {
              eligible: false,
              reason: "Stripe Connectアカウントの設定が完了していません",
            };
          }
        }
      } catch (err) {
        return {
          eligible: false,
          reason: (err as Error).message || "Stripe Connectアカウントの設定が完了していません",
        };
      }

      // 送金金額計算
      const calculation = await this.calculatePayoutAmount(eventId);
      const { minPayoutAmount } = await this.feeConfigService.getConfig();
      if (calculation.netPayoutAmount < minPayoutAmount) {
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
