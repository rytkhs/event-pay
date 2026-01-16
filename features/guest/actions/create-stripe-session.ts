"use server";

import { registerAllFeatures } from "@/app/_init/feature-registrations";

import { z } from "zod";

import type { ErrorCode } from "@core/api/problem-details";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { getPaymentService } from "@core/services";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { handleServerError } from "@core/utils/error-handler.server";
import { validateGuestToken } from "@core/utils/guest-token";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";

registerAllFeatures();

/**
 * PaymentErrorTypeをproblem-details.tsのErrorCodeにマッピング
 */
function mapPaymentErrorToErrorCode(paymentErrorType: PaymentErrorType): ErrorCode {
  switch (paymentErrorType) {
    // Connect Account関連エラー
    case PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND:
      return "CONNECT_ACCOUNT_NOT_FOUND";
    case PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED:
      return "CONNECT_ACCOUNT_RESTRICTED";
    case PaymentErrorType.STRIPE_CONFIG_ERROR:
      return "STRIPE_CONFIG_ERROR";

    // 認証・認可エラー
    case PaymentErrorType.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case PaymentErrorType.FORBIDDEN:
      return "FORBIDDEN";

    // バリデーションエラー
    case PaymentErrorType.VALIDATION_ERROR:
    case PaymentErrorType.INVALID_AMOUNT:
    case PaymentErrorType.INVALID_PAYMENT_METHOD:
      return "VALIDATION_ERROR";

    // リソース関連エラー
    case PaymentErrorType.EVENT_NOT_FOUND:
    case PaymentErrorType.ATTENDANCE_NOT_FOUND:
    case PaymentErrorType.PAYMENT_NOT_FOUND:
      return "NOT_FOUND";

    // 競合・重複エラー
    case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
    case PaymentErrorType.CONCURRENT_UPDATE:
      return "RESOURCE_CONFLICT";

    // 決済処理エラー
    case PaymentErrorType.INSUFFICIENT_FUNDS:
    case PaymentErrorType.CARD_DECLINED:
      return "PAYMENT_PROCESSING_ERROR";

    // システムエラー
    case PaymentErrorType.DATABASE_ERROR:
      return "DATABASE_ERROR";
    case PaymentErrorType.STRIPE_API_ERROR:
    case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
      return "EXTERNAL_SERVICE_ERROR";

    // その他
    case PaymentErrorType.INVALID_STATUS_TRANSITION:
    default:
      return "INTERNAL_ERROR";
  }
}

/**
 * ゲスト用 Stripe Checkout セッション作成アクション
 * ゲストトークンで本人性を検証し、Admin クライアントで決済セッションを生成する。
 */
const guestStripeSessionSchema = z.object({
  guestToken: z.string().min(36, "ゲストトークンが無効です"),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  gaClientId: z.string().optional(), // GA4 Client ID（アナリティクス追跡用）
});

export async function createGuestStripeSessionAction(
  input: unknown
): Promise<ServerActionResult<{ sessionUrl: string; sessionId: string }>> {
  // 1. 入力検証
  const parsed = guestStripeSessionSchema.safeParse(input);
  if (!parsed.success) {
    return createServerActionError("VALIDATION_ERROR", "入力データが無効です。", {
      details: { zodErrors: parsed.error.errors },
    });
  }
  const { guestToken, successUrl, cancelUrl, gaClientId } = parsed.data;

  // 2. guestToken 検証 & 参加データ取得
  const tokenResult = await validateGuestToken(guestToken);
  if (!tokenResult.isValid || !tokenResult.attendance) {
    return createServerActionError(
      "UNAUTHORIZED",
      tokenResult.errorMessage ?? "無効なゲストトークンです"
    );
  }
  const attendance = tokenResult.attendance;
  const event = attendance.event;

  // 決済許可条件の統一チェック
  const eligibilityResult = canCreateStripeSession(attendance, {
    id: event.id,
    status: deriveEventStatus(event.date, (event as any).canceled_at ?? null),
    fee: event.fee,
    date: event.date,
    payment_deadline: event.payment_deadline,
    // 新フィールド（存在しない場合は既定値で解釈）
    allow_payment_after_deadline: (event as any).allow_payment_after_deadline ?? false,
    grace_period_days: (event as any).grace_period_days ?? 0,
  });
  if (!eligibilityResult.isEligible) {
    return createServerActionError(
      "RESOURCE_CONFLICT",
      eligibilityResult.reason || "決済セッションの作成条件を満たしていません。"
    );
  }

  // 3. レート制限 (attendance 単位)
  try {
    const key = buildKey({ scope: "payment.createSession", attendanceId: attendance.id });
    const rl = await enforceRateLimit({
      keys: Array.isArray(key) ? key : [key],
      policy: POLICIES["payment.createSession"],
    });
    if (!rl.allowed) {
      return createServerActionError(
        "RATE_LIMITED",
        "Stripe Checkout セッションの作成回数が上限に達しました。しばらく待ってから再試行してください。",
        {
          retryable: true,
          details: rl.retryAfter ? { retryAfter: rl.retryAfter } : undefined,
        }
      );
    }
  } catch {
    /* レート制限ストア初期化失敗時はスキップ */
  }

  // 4. 金額妥当性 (フロント改ざん防止) - 共通チェックで既に確認済みだが念のため
  if (event.fee <= 0) {
    return createServerActionError("RESOURCE_CONFLICT", "無料イベントでは決済は不要です。");
  }

  // 5. 決済サービス呼び出し (Guest)
  const factory = SecureSupabaseClientFactory.create();
  const guestClient = factory.createGuestClient(guestToken);

  // PaymentServiceの登録は "@/app/_init/feature-registrations" で保証される
  const paymentService = getPaymentService();

  // 5.1 既存の決済レコードがあれば金額は payments.amount を優先する
  const { data: latestAmountRpc } = await (guestClient as any)
    .rpc("rpc_guest_get_latest_payment", {
      p_attendance_id: attendance.id,
      p_guest_token: guestToken,
    })
    .single();
  const existingPayment = latestAmountRpc ? { amount: latestAmountRpc as number } : undefined;

  const amountToCharge = existingPayment?.amount ?? event.fee;

  // 5.2 Stripe Connect アカウント取得 (Destination charges 前提)
  const { data: connectAccount, error: connectError } = await (guestClient as any)
    .rpc("rpc_public_get_connect_account", {
      p_event_id: event.id,
      p_creator_id: event.created_by,
    })
    .single();

  if (connectError || !connectAccount) {
    return createServerActionError(
      "RESOURCE_CONFLICT",
      "決済の準備ができません。主催者のお支払い受付設定に不備があります。現金決済をご利用いただくか、主催者にお問い合わせください。"
    );
  }

  if (!connectAccount.payouts_enabled) {
    return createServerActionError(
      "RESOURCE_CONFLICT",
      "主催者のお支払い受付が一時的に制限されています。現金決済をご利用いただくか、主催者にお問い合わせください。"
    );
  }

  const destinationChargesConfig = {
    destinationAccountId: connectAccount.stripe_account_id,
    userEmail: attendance.email,
    userName: attendance.nickname,
  } as const;

  try {
    const result = await paymentService.createStripeSession({
      attendanceId: attendance.id,
      amount: amountToCharge,
      eventId: event.id,
      actorId: attendance.id,
      eventTitle: event.title,
      successUrl,
      cancelUrl,
      destinationCharges: destinationChargesConfig,
      gaClientId, // GA4 Client IDを渡す
    });

    return createServerActionSuccess({
      sessionUrl: result.sessionUrl,
      sessionId: result.sessionId,
    });
  } catch (error) {
    const errorContext = {
      action: "guest_stripe_session_creation",
      additionalData: {
        originalError: error instanceof Error ? error.name : "Unknown",
        originalMessage: error instanceof Error ? error.message : String(error),
      },
    };

    // PaymentError の場合は適切なErrorCodeにマッピング
    if (error instanceof PaymentError) {
      const errorCode = mapPaymentErrorToErrorCode(error.type);

      // Connect Account関連エラーは特別な追加情報を含める
      const additionalDetails =
        error.type === PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND ||
        error.type === PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED ||
        error.type === PaymentErrorType.STRIPE_CONFIG_ERROR
          ? {
              details: {
                paymentErrorType: error.type,
                connectAccountIssue: true,
                alternativePaymentSuggested: true,
              },
            }
          : {};

      handleServerError(errorCode, errorContext);

      return createServerActionError(errorCode, error.message, additionalDetails);
    }

    // PaymentError以外の予期しないエラー
    handleServerError("PAYMENT_SESSION_CREATION_FAILED", errorContext);

    const msg = error instanceof Error ? error.message : "Stripe セッション作成に失敗しました";
    return createServerActionError("INTERNAL_ERROR", msg);
  }
}
