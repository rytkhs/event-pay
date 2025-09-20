"use server";

import { z } from "zod";

import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { getPaymentService } from "@core/services";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { validateGuestToken } from "@core/utils/guest-token";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";

// Server Action内でPaymentService実装の登録を確保
async function ensurePaymentServiceRegistration() {
  try {
    // PaymentService実装を動的にインポートして登録
    await import("@features/payments/core-bindings");
  } catch (error) {
    console.error("Failed to register PaymentService implementation:", error);
    throw new Error("PaymentService initialization failed");
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
  const { guestToken, successUrl, cancelUrl } = parsed.data;

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
  const factory = SecureSupabaseClientFactory.getInstance();
  const guestClient = factory.createGuestClient(guestToken);

  // PaymentService実装の登録を確実に実行
  await ensurePaymentServiceRegistration();
  const paymentService = getPaymentService();

  // 5.1 既存の決済レコードがあれば金額は payments.amount を優先する
  const { data: existingPayment } = await guestClient
    .from("payments")
    .select("amount")
    .eq("attendance_id", attendance.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const amountToCharge = existingPayment?.amount ?? event.fee;

  // 5.2 Stripe Connect アカウント取得 (Destination charges 前提)
  const { data: connectAccount, error: connectError } = await guestClient
    .from("stripe_connect_accounts")
    .select("stripe_account_id, payouts_enabled")
    .eq("user_id", event.created_by)
    .maybeSingle();

  if (connectError || !connectAccount) {
    return createServerActionError(
      "RESOURCE_CONFLICT",
      "このイベントにはStripe Connectアカウントが設定されていません。"
    );
  }

  if (!connectAccount.payouts_enabled) {
    return createServerActionError(
      "RESOURCE_CONFLICT",
      "Stripe Connectアカウントの入金機能 (payouts) が無効化されています。"
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
    });

    return createServerActionSuccess({
      sessionUrl: result.sessionUrl,
      sessionId: result.sessionId,
    });
  } catch (error) {
    const { getErrorDetails, logError } = await import("@core/utils/error-handler");

    const errorContext = {
      action: "guest_stripe_session_creation",
      additionalData: {
        originalError: error instanceof Error ? error.name : "Unknown",
        originalMessage: error instanceof Error ? error.message : String(error),
      },
    };

    // トークン検証エラーではなく、決済セッション作成失敗を記録
    logError(getErrorDetails("PAYMENT_SESSION_CREATION_FAILED"), errorContext);

    const msg = error instanceof Error ? error.message : "Stripe セッション作成に失敗しました";
    return createServerActionError("INTERNAL_ERROR", msg);
  }
}
