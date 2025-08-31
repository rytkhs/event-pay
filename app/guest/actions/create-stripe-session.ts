"use server";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { PaymentService, PaymentErrorHandler } from "@features/payments/services";
import { createRateLimitStore, checkRateLimit } from "@core/rate-limit";
import { RATE_LIMIT_CONFIG } from "@core/security";
import { validateGuestToken } from "@core/utils/guest-token";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";
import { z } from "zod";

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
  const eligibilityResult = canCreateStripeSession(attendance, event);
  if (!eligibilityResult.isEligible) {
    return createServerActionError(
      "RESOURCE_CONFLICT",
      eligibilityResult.reason || "決済セッションの作成条件を満たしていません。"
    );
  }

  // 3. レート制限 (attendance 単位)
  try {
    const store = await createRateLimitStore();
    const rl = await checkRateLimit(
      store,
      `stripe_checkout_guest_${attendance.id}`,
      RATE_LIMIT_CONFIG.stripeCheckout
    );
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

  // 5. 決済サービス呼び出し (Admin)
  const factory = SecureSupabaseClientFactory.getInstance();
  const admin = await factory.createAuditedAdminClient(
    AdminReason.PAYMENT_PROCESSING,
    "app/guest/actions/create-stripe-session"
  );
  const paymentService = new PaymentService(admin, new PaymentErrorHandler());

  // 5.1 既存の決済レコードがあれば金額は payments.amount を優先する
  const { data: existingPayment } = await admin
    .from("payments")
    .select("amount")
    .eq("attendance_id", attendance.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const amountToCharge = existingPayment?.amount ?? event.fee;

  // 5.2 Stripe Connect アカウント取得 (Destination charges 前提)
  const { data: connectAccount, error: connectError } = await admin
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

    logError(getErrorDetails("GUEST_TOKEN_VALIDATION_FAILED"), errorContext);

    const msg = error instanceof Error ? error.message : "Stripe セッション作成に失敗しました";
    return createServerActionError("INTERNAL_ERROR", msg);
  }
}
