/**
 * PaymentServiceの基本実装
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPaymentLogger, type PaymentLogger } from "@core/logging/payment-logger";
import { generateSecureUuid } from "@core/security/crypto";
import { getStripe, generateIdempotencyKey } from "@core/stripe/client";
import * as DestinationCharges from "@core/stripe/destination-charges";
import { convertStripeError } from "@core/stripe/error-handler";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import { handleServerError } from "@core/utils/error-handler.server";
import { maskSessionId } from "@core/utils/mask";
import { assertStripePayment } from "@core/utils/stripe-guards";

import { Database } from "@/types/database";

import { ApplicationFeeCalculator } from "./fee-config/application-fee-calculator";
import { IPaymentService, IPaymentErrorHandler } from "./interface";
import {
  Payment,
  PaymentMethod,
  PaymentStatus,
  CreateStripeSessionParams,
  CreateStripeSessionResult,
  CreateCashPaymentParams,
  CreateCashPaymentResult,
  UpdatePaymentStatusParams,
} from "./types";
import { findLatestPaymentByEffectiveTime } from "./utils/payment-effective-time";
import { updateWithRetries } from "./utils/supabase-retry";

/**
 * 終端決済状態の定義（決済完了系の状態）
 * 注: canceledは含めない（再参加時に新しい決済を受け付けるため）
 */
const TERMINAL_PAYMENT_STATUSES = ["paid", "received", "refunded", "waived"] as const;

/**
 * オープン決済状態の定義（処理継続可能な状態）
 */
const OPEN_PAYMENT_STATUSES = ["pending", "failed"] as const;

type TerminalPaymentStatus = (typeof TERMINAL_PAYMENT_STATUSES)[number];
type OpenPaymentStatus = (typeof OPEN_PAYMENT_STATUSES)[number];

const isTerminalPaymentStatus = (status: PaymentStatus): status is TerminalPaymentStatus => {
  return (TERMINAL_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);
};

const isOpenPaymentStatus = (status: PaymentStatus): status is OpenPaymentStatus => {
  return (OPEN_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);
};

const OPEN_PAYMENT_SELECT_COLUMNS =
  "id, status, method, amount, checkout_idempotency_key, checkout_key_revision, stripe_payment_intent_id, paid_at, created_at, updated_at";

type OpenPaymentRow = {
  id: string;
  status: PaymentStatus;
  method: PaymentMethod;
  amount: number;
  checkout_idempotency_key: string | null;
  checkout_key_revision: number;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type EnsurePaymentRecordResult = {
  paymentId: string;
  idempotencyKey: string;
  checkoutKeyRevision: number;
};

/**
 * PaymentServiceの実装クラス
 */
export class PaymentService implements IPaymentService {
  private supabase: SupabaseClient<Database, "public">;
  private stripe = getStripe();
  private errorHandler: IPaymentErrorHandler;
  private applicationFeeCalculator: ApplicationFeeCalculator;
  private paymentLogger: PaymentLogger;

  constructor(
    supabaseClient: SupabaseClient<Database, "public">,
    errorHandler: IPaymentErrorHandler
  ) {
    this.supabase = supabaseClient;
    this.errorHandler = errorHandler;
    this.applicationFeeCalculator = new ApplicationFeeCalculator(supabaseClient);
    this.paymentLogger = createPaymentLogger({ category: "payment", action: "payment_service" });
  }

  /**
   * 決済レコードの有効時間を計算（状態別優先順位適用）
   */

  private normalizeOpenPaymentRow(row: Record<string, unknown>): OpenPaymentRow | null {
    if (!row || typeof row.id !== "string") return null;

    const checkoutKeyRevisionRaw = row.checkout_key_revision;
    const checkoutKeyRevision =
      typeof checkoutKeyRevisionRaw === "number"
        ? checkoutKeyRevisionRaw
        : typeof checkoutKeyRevisionRaw === "string" && /^\d+$/.test(checkoutKeyRevisionRaw)
          ? Number.parseInt(checkoutKeyRevisionRaw, 10)
          : 0;

    if (
      checkoutKeyRevisionRaw !== null &&
      checkoutKeyRevisionRaw !== undefined &&
      typeof checkoutKeyRevisionRaw !== "number"
    ) {
      this.paymentLogger.warn("checkout_key_revision is not a number; coercing to 0", {
        payment_id: row.id,
        checkout_key_revision_raw: checkoutKeyRevisionRaw,
      });
    }

    return {
      id: row.id,
      status: row.status as PaymentStatus,
      method: row.method as PaymentMethod,
      amount: typeof row.amount === "number" ? row.amount : 0,
      checkout_idempotency_key:
        typeof row.checkout_idempotency_key === "string" ? row.checkout_idempotency_key : null,
      checkout_key_revision: checkoutKeyRevision,
      stripe_payment_intent_id:
        typeof row.stripe_payment_intent_id === "string" ? row.stripe_payment_intent_id : null,
      paid_at: typeof row.paid_at === "string" ? row.paid_at : null,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
      updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    };
  }

  private async ensureStripePaymentRecord(
    params: CreateStripeSessionParams
  ): Promise<EnsurePaymentRecordResult> {
    const { data: openPayments, error: openPaymentsError } = await this.supabase
      .from("payments")
      .select(OPEN_PAYMENT_SELECT_COLUMNS)
      .eq("attendance_id", params.attendanceId)
      .in("status", OPEN_PAYMENT_STATUSES);

    if (openPaymentsError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済レコード（open）の検索に失敗しました: ${openPaymentsError.message}`,
        openPaymentsError
      );
    }

    const normalizedOpenPayments = (openPayments ?? [])
      .map((payment) => this.normalizeOpenPaymentRow(payment as unknown as Record<string, unknown>))
      .filter((payment): payment is OpenPaymentRow => payment !== null);

    const selectPreferredOpenPayment = (payments: OpenPaymentRow[]): OpenPaymentRow | null => {
      if (!payments.length) return null;
      const pendingPayments = payments.filter((payment) => payment.status === "pending");
      if (pendingPayments.length > 0) {
        return findLatestPaymentByEffectiveTime(pendingPayments, TERMINAL_PAYMENT_STATUSES);
      }
      return findLatestPaymentByEffectiveTime(payments, TERMINAL_PAYMENT_STATUSES);
    };

    const openPayment = selectPreferredOpenPayment(normalizedOpenPayments);

    const { data: existingTerminal, error: terminalFindError } = await this.supabase
      .from("payments")
      .select("id")
      .eq("attendance_id", params.attendanceId)
      .in("status", TERMINAL_PAYMENT_STATUSES)
      .limit(1)
      .maybeSingle();

    if (terminalFindError) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済レコード（終端）の検索に失敗しました: ${terminalFindError.message}`,
        terminalFindError
      );
    }

    if (existingTerminal) {
      throw new PaymentError(
        PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        "この参加に対する決済は既に完了済みです"
      );
    }

    const buildIdempotencyKey = () => generateIdempotencyKey("checkout");

    const fetchOpenPaymentById = async (paymentId: string): Promise<OpenPaymentRow | null> => {
      const { data: currentOpen, error: fetchError } = await this.supabase
        .from("payments")
        .select(OPEN_PAYMENT_SELECT_COLUMNS)
        .eq("id", paymentId)
        .maybeSingle();

      if (fetchError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの再取得に失敗しました: ${fetchError.message}`,
          fetchError
        );
      }

      const normalized = currentOpen
        ? this.normalizeOpenPaymentRow(currentOpen as Record<string, unknown>)
        : null;

      if (!normalized) {
        return null;
      }

      if (isTerminalPaymentStatus(normalized.status)) {
        throw new PaymentError(
          PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          "この参加に対する決済は既に完了済みです"
        );
      }

      if (!isOpenPaymentStatus(normalized.status)) {
        throw new PaymentError(
          PaymentErrorType.CONCURRENT_UPDATE,
          "決済情報が更新されています。再試行してください。"
        );
      }

      return normalized;
    };

    const reusePendingPayment = async (
      pendingPayment: OpenPaymentRow
    ): Promise<EnsurePaymentRecordResult> => {
      const currentRevision = pendingPayment.checkout_key_revision;
      const idempotencyKey = buildIdempotencyKey();
      const checkoutKeyRevision = currentRevision + 1;

      const { data: reserved, error: reserveError } = await this.supabase
        .from("payments")
        .update({
          amount: params.amount,
          stripe_payment_intent_id: null,
          stripe_checkout_session_id: null,
          checkout_idempotency_key: idempotencyKey,
          checkout_key_revision: checkoutKeyRevision,
        })
        .eq("id", pendingPayment.id)
        .eq("checkout_key_revision", currentRevision)
        .select(OPEN_PAYMENT_SELECT_COLUMNS)
        .maybeSingle();

      if (reserveError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `既存決済の更新に失敗しました: ${reserveError.message}`,
          reserveError
        );
      }

      const normalizedReserved = reserved
        ? this.normalizeOpenPaymentRow(reserved as Record<string, unknown>)
        : null;

      if (normalizedReserved?.checkout_idempotency_key === idempotencyKey) {
        this.paymentLogger.info("Idempotency key reserved", {
          attendance_id: params.attendanceId,
          has_open_payment: true,
          final_key: idempotencyKey.substring(0, 12) + "...",
          final_revision: checkoutKeyRevision,
        });

        return {
          paymentId: pendingPayment.id,
          idempotencyKey,
          checkoutKeyRevision,
        };
      }

      const latestOpen = await fetchOpenPaymentById(pendingPayment.id);

      if (!latestOpen) {
        this.paymentLogger.warn("Idempotency key reservation returned no row; fallback", {
          attendance_id: params.attendanceId,
          payment_id: pendingPayment.id,
          final_key: idempotencyKey.substring(0, 12) + "...",
          final_revision: checkoutKeyRevision,
        });

        return {
          paymentId: pendingPayment.id,
          idempotencyKey,
          checkoutKeyRevision,
        };
      }

      if (latestOpen.checkout_idempotency_key) {
        if (latestOpen.amount !== params.amount) {
          this.paymentLogger.warn("Concurrent checkout reserved with different amount", {
            attendance_id: params.attendanceId,
            payment_id: latestOpen.id,
            requested_amount: params.amount,
            reserved_amount: latestOpen.amount,
            reserved_revision: latestOpen.checkout_key_revision,
          });
          throw new PaymentError(
            PaymentErrorType.CONCURRENT_UPDATE,
            "決済情報が更新されています。再試行してください。"
          );
        }

        this.paymentLogger.info("Idempotency key reused after concurrent reservation", {
          attendance_id: params.attendanceId,
          payment_id: latestOpen.id,
          final_key: latestOpen.checkout_idempotency_key.substring(0, 12) + "...",
          final_revision: latestOpen.checkout_key_revision,
        });

        return {
          paymentId: latestOpen.id,
          idempotencyKey: latestOpen.checkout_idempotency_key,
          checkoutKeyRevision: latestOpen.checkout_key_revision,
        };
      }

      this.paymentLogger.warn("Idempotency key reservation missing after update; fallback", {
        attendance_id: params.attendanceId,
        payment_id: latestOpen.id,
        final_key: idempotencyKey.substring(0, 12) + "...",
        final_revision: checkoutKeyRevision,
      });

      return {
        paymentId: pendingPayment.id,
        idempotencyKey,
        checkoutKeyRevision,
      };
    };

    const fetchConcurrentOpenPayments = async (): Promise<OpenPaymentRow[]> => {
      const { data: concurrentOpen, error: refetchOpenError } = await this.supabase
        .from("payments")
        .select(OPEN_PAYMENT_SELECT_COLUMNS)
        .eq("attendance_id", params.attendanceId)
        .in("status", OPEN_PAYMENT_STATUSES);

      if (refetchOpenError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `既存open決済の再取得に失敗しました: ${refetchOpenError.message}`,
          refetchOpenError
        );
      }

      return (concurrentOpen ?? [])
        .map((payment) => this.normalizeOpenPaymentRow(payment as Record<string, unknown>))
        .filter((payment): payment is OpenPaymentRow => payment !== null);
    };

    const fetchConcurrentOpenPreferPending = async (): Promise<OpenPaymentRow | null> => {
      const concurrentOpen = await fetchConcurrentOpenPayments();
      return selectPreferredOpenPayment(concurrentOpen);
    };

    const fetchConcurrentOpenLatest = async (): Promise<OpenPaymentRow | null> => {
      const concurrentOpen = await fetchConcurrentOpenPayments();
      return findLatestPaymentByEffectiveTime(concurrentOpen, TERMINAL_PAYMENT_STATUSES);
    };

    if (openPayment) {
      if (openPayment.status === "pending") {
        return await reusePendingPayment(openPayment);
      }

      const newIdempotencyKey = buildIdempotencyKey();
      const { data: payment, error: insertError } = await this.supabase
        .from("payments")
        .insert({
          attendance_id: params.attendanceId,
          method: "stripe",
          amount: params.amount,
          status: "pending",
          checkout_idempotency_key: newIdempotencyKey,
          checkout_key_revision: 0,
        })
        .select()
        .single();

      if (insertError) {
        if (insertError.code === "23505") {
          const concurrentOpen = await fetchConcurrentOpenPreferPending();

          if (concurrentOpen) {
            if (concurrentOpen.status === "pending") {
              return await reusePendingPayment(concurrentOpen);
            }

            const { data: terminalAfterRace } = await this.supabase
              .from("payments")
              .select("id")
              .eq("attendance_id", params.attendanceId)
              .in("status", TERMINAL_PAYMENT_STATUSES)
              .order("paid_at", { ascending: false, nullsFirst: false })
              .limit(1)
              .maybeSingle();

            if (terminalAfterRace) {
              throw new PaymentError(
                PaymentErrorType.PAYMENT_ALREADY_EXISTS,
                "この参加に対する決済は既に完了済みです",
                insertError
              );
            }

            throw new PaymentError(
              PaymentErrorType.DATABASE_ERROR,
              "決済レコードの作成に失敗しました（再試行してください）",
              insertError
            );
          }

          const { data: terminalAfterRace } = await this.supabase
            .from("payments")
            .select("id")
            .eq("attendance_id", params.attendanceId)
            .in("status", TERMINAL_PAYMENT_STATUSES)
            .order("paid_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();

          if (terminalAfterRace) {
            throw new PaymentError(
              PaymentErrorType.PAYMENT_ALREADY_EXISTS,
              "この参加に対する決済は既に完了済みです",
              insertError
            );
          }

          throw new PaymentError(
            PaymentErrorType.DATABASE_ERROR,
            `決済レコードの作成に失敗しました: ${insertError.message}`,
            insertError
          );
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの作成に失敗しました: ${insertError.message}`,
          insertError
        );
      }

      assertStripePayment(payment, "payment lookup");
      return {
        paymentId: payment.id,
        idempotencyKey: newIdempotencyKey,
        checkoutKeyRevision: 0,
      };
    }

    const newIdempotencyKey = buildIdempotencyKey();
    const { data: payment, error: insertError } = await this.supabase
      .from("payments")
      .insert({
        attendance_id: params.attendanceId,
        method: "stripe",
        amount: params.amount,
        status: "pending",
        checkout_idempotency_key: newIdempotencyKey,
        checkout_key_revision: 0,
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const concurrentOpen = await fetchConcurrentOpenLatest();

        if (concurrentOpen) {
          if (concurrentOpen.status === "pending") {
            return await reusePendingPayment(concurrentOpen);
          }

          throw new PaymentError(
            PaymentErrorType.DATABASE_ERROR,
            "決済レコードの作成に失敗しました（再試行してください）",
            insertError
          );
        }

        const { data: terminalAfterRace } = await this.supabase
          .from("payments")
          .select("id")
          .eq("attendance_id", params.attendanceId)
          .in("status", TERMINAL_PAYMENT_STATUSES)
          .order("paid_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();

        if (terminalAfterRace) {
          throw new PaymentError(
            PaymentErrorType.PAYMENT_ALREADY_EXISTS,
            "この参加に対する決済は既に完了済みです",
            insertError
          );
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの作成に失敗しました: ${insertError.message}`,
          insertError
        );
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済レコードの作成に失敗しました: ${insertError.message}`,
        insertError
      );
    }

    assertStripePayment(payment, "payment lookup");
    return {
      paymentId: payment.id,
      idempotencyKey: newIdempotencyKey,
      checkoutKeyRevision: 0,
    };
  }

  /**
   * Stripe決済セッションを作成する
   *
   * 重複作成ガードについて:
   * - 重複検知と一意性の最終責務は本メソッド（Service）に集約する。
   * - 振る舞い（DBの降格禁止ルールに整合）:
   *   - 参加に紐づく既存決済が支払完了系（paid/received/refunded/waived）の場合は
   *     【無条件で】PaymentErrorType.PAYMENT_ALREADY_EXISTS を投げる（重複課金防止）。
   *   - openが pending の場合のみ同レコードを再利用（Stripe識別子のリセットと金額更新）。
   *   - openが failed の場合は新規に pending レコードを作成（failed→pending の降格は行わない）。
   *   - canceled の決済がある場合は無視して新規作成（再参加時のシナリオ）。
   *   - DB一意制約違反（23505）は並行作成とみなし、直近の open を再利用する。
   * - 決済レコードの最新性判定は統一されたeffectiveTime計算ロジックを使用:
   *   - 決済完了状態（paid/received/refunded/waived）: paid_at > updated_at > created_at の優先順位
   *   - 未完了状態（pending/failed/canceled）: updated_at > created_at の優先順位
   * - Action 層では重複チェックを省略してよい（最終判断は本メソッド）。
   */
  async createStripeSession(params: CreateStripeSessionParams): Promise<CreateStripeSessionResult> {
    const correlationId = `session_${generateSecureUuid()}`;
    const contextLogger = this.paymentLogger.withContext({
      attendance_id: params.attendanceId,
      event_id: params.eventId,
      amount: params.amount,
      payment_method: "stripe",
      correlation_id: correlationId,
      connect_account_id: params.destinationCharges?.destinationAccountId,
    });

    contextLogger.startOperation("create_stripe_session", {
      actor_id: params.actorId,
      event_title: params.eventTitle,
    });

    try {
      const {
        paymentId: targetPaymentId,
        idempotencyKey: idempotencyKeyToUse,
        checkoutKeyRevision: checkoutKeyRevisionToSave,
      } = await this.ensureStripePaymentRecord(params);

      // Stripe Checkout Sessionを作成（Destination chargesに統一）
      if (!params.destinationCharges) {
        contextLogger.logPaymentError(
          "create_stripe_session",
          new Error("Destination charges configuration is required"),
          { payment_phase: "validation" }
        );
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "Destination charges configuration is required"
        );
      }
      const { destinationAccountId, userEmail, userName, setupFutureUsage } =
        params.destinationCharges;

      // Connect Account情報をログに記録
      contextLogger.logConnectAccountValidation(destinationAccountId, true, {
        user_email: userEmail,
        user_name: userName,
        payment_id: targetPaymentId,
      });

      // TODO: Connect Account の事前検証（別タスクで実装予定）
      // await this.validateConnectAccount(destinationAccountId);

      // Application fee計算
      const feeCalculation = await this.applicationFeeCalculator.calculateApplicationFee(
        params.amount
      );

      // Customer作成・取得
      let customerId: string | undefined;
      if (userEmail || userName) {
        const customer = await DestinationCharges.createOrRetrieveCustomer({
          email: userEmail,
          name: userName,
          metadata: {
            actor_id: params.actorId,
            event_id: params.eventId,
          },
        });
        customerId = customer.id;
      }

      // Destination charges用のCheckout Session作成
      // Idempotency-Key: 基本は新規発行（並行復帰時は確保済みキーを再利用する場合あり）
      const session = await DestinationCharges.createDestinationCheckoutSession({
        eventId: params.eventId,
        eventTitle: params.eventTitle,
        amount: params.amount,
        destinationAccountId,
        platformFeeAmount: feeCalculation.applicationFeeAmount,
        customerId,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        actorId: params.actorId,
        gaClientId: params.gaClientId, // GA4 Client IDを渡す
        metadata: {
          payment_id: targetPaymentId,
          attendance_id: params.attendanceId,
          event_title: params.eventTitle,
        },
        setupFutureUsage,
        idempotencyKey: idempotencyKeyToUse,
      });

      // --- DB に Destination charges 関連情報を保存 (リトライ付き) ---
      const updateDestinationPayload = {
        stripe_checkout_session_id: session.id,
        destination_account_id: destinationAccountId,
        application_fee_amount: feeCalculation.applicationFeeAmount,
        transfer_group: `event_${params.eventId}_payout`,
        stripe_customer_id: customerId,
        checkout_idempotency_key: idempotencyKeyToUse,
        checkout_key_revision: checkoutKeyRevisionToSave,
      } as const;

      const { data: updatedPayment, error: lastDbError } = await updateWithRetries({
        attempt: async () => {
          const { data, error } = await this.supabase
            .from("payments")
            .update(updateDestinationPayload)
            .eq("id", targetPaymentId)
            .select("id, checkout_idempotency_key, checkout_key_revision")
            .maybeSingle();
          return { data, error };
        },
        isSuccess: ({ data, error }) => !error && !!data,
      });

      if (lastDbError || !updatedPayment) {
        const dbError = new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `Failed to update payment record with destination charges data after retries: ${
            lastDbError?.message ?? "no rows updated"
          }`,
          (lastDbError ?? undefined) as unknown as Error
        );
        await this.errorHandler.logError(dbError, {
          operation: "updateDestinationChargesData",
          paymentId: targetPaymentId,
          sessionId: maskSessionId(session.id),
          destinationAccountId,
          applicationFeeAmount: feeCalculation.applicationFeeAmount,
        });
        // 決済整合性のために処理を中断
        throw dbError;
      }

      // 既存のログも残しつつ、構造化ログも追加
      this.paymentLogger.info("Destination charges session created", {
        paymentId: targetPaymentId,
        sessionId: maskSessionId(session.id),
        amount: params.amount,
        applicationFeeAmount: feeCalculation.applicationFeeAmount,
        destinationAccountId,
        transferGroup: `event_${params.eventId}_payout`,
        actorId: params.actorId,
      });

      // 構造化ログでセッション作成成功を記録
      contextLogger.logSessionCreation(true, {
        payment_id: targetPaymentId,
        stripe_session_id: maskSessionId(session.id),
        session_url: session.url || undefined,
        application_fee_amount: feeCalculation.applicationFeeAmount,
        transfer_group: `event_${params.eventId}_payout`,
      });

      // 監査ログ記録
      const { logPayment } = await import("@core/logging/system-logger");
      await logPayment({
        action: "checkout.session_create",
        message: `Checkout session created: ${targetPaymentId}`,
        resource_id: targetPaymentId,
        outcome: "success",
        stripe_request_id: session.id,
        idempotency_key: idempotencyKeyToUse,
        metadata: {
          event_id: params.eventId,
          amount: session.amount_total,
          application_fee: feeCalculation.applicationFeeAmount,
          destination_account: destinationAccountId,
        },
      });

      if (!session.url) {
        throw new PaymentError(
          PaymentErrorType.STRIPE_API_ERROR,
          "Stripe session URL is not available"
        );
      }

      // 最終成功ログ
      contextLogger.operationSuccess("create_stripe_session", {
        payment_id: targetPaymentId,
        stripe_session_id: maskSessionId(session.id),
        session_url: session.url,
      });

      return {
        sessionUrl: session.url,
        sessionId: session.id,
      };
    } catch (error) {
      if (error instanceof PaymentError) {
        // PaymentErrorの場合もログに記録
        contextLogger.logPaymentError("create_stripe_session", error);
        throw error;
      }

      // 構造化ログでエラーを記録
      contextLogger.logPaymentError("create_stripe_session", error);

      // Stripe固有エラーの場合は汎用ハンドラーで詳細分類
      if (error && typeof error === "object" && "type" in error) {
        const stripeError = error as any;
        if (stripeError.type && typeof stripeError.type === "string") {
          const enhancedError = convertStripeError(stripeError, {
            operation: "create_stripe_session",
            connectAccountId: params.destinationCharges?.destinationAccountId,
            amount: params.amount,
            sessionId: undefined,
            additionalData: {
              event_id: params.eventId,
              attendance_id: params.attendanceId,
              actor_id: params.actorId,
            },
          });
          throw enhancedError;
        }
      }

      // その他のエラーの場合は汎用的なPaymentError
      const genericError = new PaymentError(
        PaymentErrorType.STRIPE_API_ERROR,
        "Stripe決済セッションの作成に失敗しました",
        error as Error
      );
      throw genericError;
    }
  }

  /**
   * 現金決済レコードを作成する
   */
  async createCashPayment(params: CreateCashPaymentParams): Promise<CreateCashPaymentResult> {
    try {
      const { data: payment, error } = await this.supabase
        .from("payments")
        .insert({
          attendance_id: params.attendanceId,
          method: "cash",
          amount: params.amount,
          status: "pending",
        })
        .select()
        .single();

      if (error) {
        // 重複エラーの場合は専用のエラータイプを使用
        if (error.code === "23505") {
          throw new PaymentError(
            PaymentErrorType.PAYMENT_ALREADY_EXISTS,
            "この参加記録に対する決済レコードは既に存在します",
            error
          );
        }

        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `現金決済レコードの作成に失敗しました: ${error.message}`,
          error
        );
      }

      return {
        paymentId: payment.id,
      };
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "現金決済レコードの作成に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 決済ステータスを更新する
   */
  async updatePaymentStatus(params: UpdatePaymentStatusParams): Promise<void> {
    const contextLogger = this.paymentLogger.withContext({
      payment_id: params.paymentId,
      user_id: params.userId,
      correlation_id: `status_update_${generateSecureUuid()}`,
    });

    contextLogger.startOperation("update_payment_status", {
      expected_version: params.expectedVersion,
      new_status: params.status,
      notes: params.notes,
    });

    try {
      // 楽観的ロック対応：現金決済の場合はRPCを使用、それ以外は従来通り
      if (params.expectedVersion !== undefined && params.userId) {
        // 楽観的ロック付きの安全更新（現金決済用）
        await this.updatePaymentStatusSafe(params);
      } else {
        // 従来の更新方法（Stripe決済用など）
        await this.updatePaymentStatusLegacy(params);
      }

      // 成功ログを記録
      contextLogger.operationSuccess("update_payment_status");
    } catch (error) {
      // エラーログを記録
      contextLogger.logPaymentError("update_payment_status", error);

      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済ステータスの更新に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 楽観的ロック付きの決済ステータス更新（現金決済用）
   */
  private async updatePaymentStatusSafe(params: UpdatePaymentStatusParams): Promise<void> {
    try {
      if (!params.expectedVersion) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "Expected version is required for safe status update"
        );
      }
      if (!params.userId) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "User ID is required for status update"
        );
      }

      const { data: _data, error } = await this.supabase.rpc("rpc_update_payment_status_safe", {
        p_payment_id: params.paymentId,
        p_new_status: params.status,
        p_expected_version: params.expectedVersion,
        p_user_id: params.userId,
        p_notes: params.notes ?? undefined,
      });

      if (error) {
        // PostgreSQLのエラーコードを確認
        if (error.code === "40001") {
          // serialization_failure = 楽観的ロック競合
          throw new PaymentError(
            PaymentErrorType.CONCURRENT_UPDATE,
            "他のユーザーによって同時に更新されました。最新の状態を確認してから再試行してください。"
          );
        } else if (error.code === "P0001") {
          // 権限エラー
          throw new PaymentError(
            PaymentErrorType.FORBIDDEN,
            "この操作を実行する権限がありません。"
          );
        } else if (error.code === "P0002") {
          // 決済レコードが見つからない
          throw new PaymentError(
            PaymentErrorType.PAYMENT_NOT_FOUND,
            "指定された決済レコードが見つかりません。"
          );
        } else if (error.code === "P0003") {
          // 現金決済でない
          throw new PaymentError(
            PaymentErrorType.INVALID_PAYMENT_METHOD,
            "現金決済以外は手動更新できません。"
          );
        } else {
          throw new PaymentError(
            PaymentErrorType.DATABASE_ERROR,
            `決済ステータスの更新に失敗しました: ${error.message}`,
            error
          );
        }
      }

      // 正常に更新完了
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済ステータスの更新に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 従来の決済ステータス更新（Stripe決済用など）
   */
  private async updatePaymentStatusLegacy(params: UpdatePaymentStatusParams): Promise<void> {
    const updateData: {
      status: PaymentStatus;
      paid_at?: string;
      stripe_payment_intent_id?: string | null;
    } = {
      status: params.status,
    };

    if (params.paidAt) {
      updateData.paid_at = params.paidAt.toISOString();
    }

    if (params.stripePaymentIntentId) {
      updateData.stripe_payment_intent_id = params.stripePaymentIntentId;
    }

    const { data, error } = await this.supabase
      .from("payments")
      .update(updateData)
      .eq("id", params.paymentId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        `決済ステータスの更新に失敗しました: ${error.message}`,
        error
      );
    }

    if (!data) {
      throw new PaymentError(
        PaymentErrorType.PAYMENT_NOT_FOUND,
        "指定された決済レコードが見つかりません"
      );
    }

    // 監査ログ記録
    const { logPayment } = await import("@core/logging/system-logger");
    await logPayment({
      action: "payment.status_update",
      message: `Payment status updated: ${params.paymentId}`,
      resource_id: params.paymentId,
      outcome: "success",
      metadata: {
        new_status: params.status,
        update_source: "service",
        paid_at: params.paidAt?.toISOString(),
      },
    });
  }

  /**
   * 複数の決済ステータスを一括更新する（楽観的ロック対応）
   */
  async bulkUpdatePaymentStatus(
    updates: Array<{
      paymentId: string;
      status: PaymentStatus;
      expectedVersion: number;
    }>,
    userId: string,
    notes?: string
  ): Promise<{
    successCount: number;
    failureCount: number;
    failures: Array<{
      paymentId: string;
      error: string;
    }>;
  }> {
    const contextLogger = this.paymentLogger.withContext({
      user_id: userId,
      correlation_id: `bulk_update_${generateSecureUuid()}`,
      bulk_operation_count: updates.length,
    });

    contextLogger.startOperation("bulk_update_payment_status", {
      update_count: updates.length,
      notes,
    });

    try {
      // 入力バリデーション
      if (updates.length === 0) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "更新対象の決済が指定されていません"
        );
      }

      if (updates.length > 50) {
        throw new PaymentError(
          PaymentErrorType.VALIDATION_ERROR,
          "一度に更新できる決済は最大50件です"
        );
      }

      // 一括更新用RPCに渡すJSONデータを構築
      const paymentUpdates = updates.map((update) => ({
        payment_id: update.paymentId,
        expected_version: update.expectedVersion,
        new_status: update.status,
      }));

      const { data, error } = await this.supabase.rpc("rpc_bulk_update_payment_status_safe", {
        p_payment_updates: paymentUpdates,
        p_user_id: userId,
        p_notes: notes ?? undefined,
      });

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `一括更新に失敗しました: ${error.message}`,
          error
        );
      }

      // RPC結果をパース
      const result = data as {
        success_count: number;
        failure_count: number;
        failures: Array<{
          payment_id: string;
          error_code: string;
          error_message: string;
        }>;
      };

      const response = {
        successCount: result.success_count,
        failureCount: result.failure_count,
        failures: result.failures.map((failure) => ({
          paymentId: failure.payment_id,
          error: failure.error_message,
        })),
      };

      // 一括更新の結果をログに記録
      contextLogger.logBulkStatusUpdate(result.success_count, result.failure_count, {
        total_updates: updates.length,
        failures: result.failures.length > 0 ? result.failures : undefined,
      });

      contextLogger.operationSuccess("bulk_update_payment_status");

      return response;
    } catch (error) {
      // エラーログを記録
      contextLogger.logPaymentError("bulk_update_payment_status", error);

      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "一括更新に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 参加記録IDから決済情報を取得する
   *
   * 注: canceledの決済は返さない（履歴として残るのみで、再参加時は新しい決済を作成するため）
   */
  async getPaymentByAttendance(attendanceId: string): Promise<Payment | null> {
    try {
      // open（pending/failed）を優先的に返す（統一されたソート使用）
      const { data: openPayments, error: openError } = await this.supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", attendanceId)
        .in("status", OPEN_PAYMENT_STATUSES);

      if (openError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${openError.message}`,
          openError
        );
      }

      const latestOpenPayment = findLatestPaymentByEffectiveTime(
        openPayments || [],
        TERMINAL_PAYMENT_STATUSES
      );
      if (latestOpenPayment) return latestOpenPayment as Payment;

      // openが無い場合は、最新の決済完了系（paid/received/refunded/waived）を返す（統一されたソート使用）
      const { data: terminalPayments, error: terminalError } = await this.supabase
        .from("payments")
        .select("*")
        .eq("attendance_id", attendanceId)
        .in("status", TERMINAL_PAYMENT_STATUSES);

      if (terminalError) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${terminalError.message}`,
          terminalError
        );
      }

      const latestTerminalPayment = findLatestPaymentByEffectiveTime(
        terminalPayments || [],
        TERMINAL_PAYMENT_STATUSES
      );
      if (!latestTerminalPayment) return null;
      return latestTerminalPayment as Payment;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済情報の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 決済IDから決済情報を取得する
   */
  async getPaymentById(paymentId: string): Promise<Payment | null> {
    try {
      const { data, error } = await this.supabase
        .from("payments")
        .select("*")
        .eq("id", paymentId)
        .maybeSingle();

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済情報の取得に失敗しました: ${error.message}`,
          error
        );
      }

      if (!data) return null;
      return data as Payment;
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済情報の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * イベントの決済リストを取得する（主催者用）
   */
  async getPaymentsByEvent(eventId: string, userId: string): Promise<Payment[]> {
    try {
      // イベントの主催者権限をチェックしつつ決済情報を取得
      const { data, error } = await this.supabase
        .from("payments")
        .select(
          `
          *,
          attendances!inner (
            id,
            events!inner (
              id,
              created_by
            )
          )
        `
        )
        .eq("attendances.events.id", eventId)
        .eq("attendances.events.created_by", userId);

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `イベント決済情報の取得に失敗しました: ${error.message}`,
          error
        );
      }

      // ネストしたデータから決済情報のみを抽出
      return data.map((item) => ({
        id: item.id,
        attendance_id: item.attendance_id,
        method: item.method as PaymentMethod,
        amount: item.amount,
        status: item.status as PaymentStatus,
        stripe_payment_intent_id: item.stripe_payment_intent_id,
        webhook_event_id: item.webhook_event_id,
        webhook_processed_at: item.webhook_processed_at,
        paid_at: item.paid_at,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "イベント決済情報の取得に失敗しました",
        error as Error
      );
    }
  }

  /**
   * 決済レコードを削除する
   */
  async deletePayment(paymentId: string): Promise<void> {
    try {
      const { error } = await this.supabase.from("payments").delete().eq("id", paymentId);

      if (error) {
        throw new PaymentError(
          PaymentErrorType.DATABASE_ERROR,
          `決済レコードの削除に失敗しました: ${error.message}`,
          error
        );
      }

      // 監査ログ記録
      const { logPayment } = await import("@core/logging/system-logger");
      await logPayment({
        action: "payment.delete",
        message: `Payment deleted: ${paymentId}`,
        resource_id: paymentId,
        outcome: "success",
        metadata: { reason: "manual_deletion" },
      });
    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }

      throw new PaymentError(
        PaymentErrorType.DATABASE_ERROR,
        "決済レコードの削除に失敗しました",
        error as Error
      );
    }
  }

  /**
   * Connect Account の事前検証を行う
   * @param accountId Stripe Connect Account ID
   * @throws PaymentError Connect Account に問題がある場合
   */
  private async validateConnectAccount(accountId: string): Promise<void> {
    try {
      // Stripe APIでConnect Account情報を取得
      const account = await this.stripe.accounts.retrieve(accountId);

      // 1. アカウントが制限されていないかチェック
      if (account.requirements?.disabled_reason) {
        this.paymentLogger.warn("Connect Account is restricted", {
          connect_account_id: accountId,
          disabled_reason: account.requirements.disabled_reason,
          outcome: "failure",
        });
        throw new PaymentError(
          PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
          `Connect Account is restricted: ${account.requirements.disabled_reason}`,
          { accountId, disabledReason: account.requirements.disabled_reason }
        );
      }

      // 2. payouts_enabled がtrueかチェック
      if (!account.payouts_enabled) {
        this.paymentLogger.warn("Connect Account payouts not enabled", {
          connect_account_id: accountId,
          payouts_enabled: account.payouts_enabled,
          outcome: "failure",
        });
        throw new PaymentError(
          PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
          "Connect Account payouts are not enabled",
          { accountId, payoutsEnabled: account.payouts_enabled }
        );
      }

      // 3. transfers capability がactiveかチェック
      const transfersCap = account.capabilities?.transfers;
      const isTransfersActive = (() => {
        if (transfersCap === "active") return true;
        if (typeof transfersCap === "object" && transfersCap && "status" in transfersCap) {
          return (transfersCap as any).status === "active";
        }
        return false;
      })();

      if (!isTransfersActive) {
        this.paymentLogger.warn("Connect Account transfers capability not active", {
          connect_account_id: accountId,
          transfers_capability: transfersCap,
          outcome: "failure",
        });
        throw new PaymentError(
          PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
          "Connect Account transfers capability is not active",
          { accountId, transfersCapability: transfersCap }
        );
      }

      this.paymentLogger.info("Connect Account validation passed", {
        connect_account_id: accountId,
        payouts_enabled: account.payouts_enabled,
        transfers_capability: transfersCap,
        outcome: "success",
      });
    } catch (error) {
      // PaymentErrorはそのまま再スロー
      if (error instanceof PaymentError) {
        throw error;
      }

      // Stripe APIエラーの場合
      if (error && typeof error === "object" && "type" in error) {
        const stripeError = error as { message?: string; type?: string };

        // "No such account" エラーは CONNECT_ACCOUNT_NOT_FOUND として分類
        if (
          stripeError.message?.includes("No such account") ||
          stripeError.message?.includes("does not exist")
        ) {
          handleServerError("STRIPE_CONNECT_ACCOUNT_NOT_FOUND", {
            category: "payment",
            action: "validate_connect_account",
            additionalData: {
              connect_account_id: accountId,
              error_message: stripeError.message,
            },
          });
          throw new PaymentError(
            PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND,
            `Connect Account not found: ${accountId}`,
            error
          );
        }

        // その他のStripe APIエラー
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "payment",
          action: "validate_connect_account_stripe_error",
          additionalData: {
            connect_account_id: accountId,
            error_type: stripeError.type,
            error_message: stripeError.message,
          },
        });
        throw new PaymentError(
          PaymentErrorType.STRIPE_CONFIG_ERROR,
          `Connect Account validation failed: ${stripeError.message}`,
          error
        );
      }

      // その他の予期しないエラー
      handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
        category: "payment",
        action: "validate_connect_account_unexpected_error",
        additionalData: {
          connect_account_id: accountId,
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
        },
      });
      throw new PaymentError(
        PaymentErrorType.STRIPE_CONFIG_ERROR,
        "Connect Account validation failed due to unexpected error",
        error as Error
      );
    }
  }
}
