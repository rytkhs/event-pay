"use server";

import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import { PaymentService, PaymentErrorHandler, PaymentValidator } from "@/lib/services/payment";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { createStripeSessionRequestSchema } from "@/lib/services/payment/validation";
import { PaymentError, PaymentErrorType } from "@/lib/services/payment/types";
import { canCreateStripeSession } from "@/lib/validation/payment-eligibility";
import type { EventStatus, AttendanceStatus } from "@/types/enums";
import { isValidPaymentStatus } from "@/types/enums";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
  type ErrorCode,
} from "@/lib/types/server-actions";

function mapPaymentError(type: PaymentErrorType): ErrorCode {
  switch (type) {
    case PaymentErrorType.VALIDATION_ERROR:
      return "VALIDATION_ERROR";
    case PaymentErrorType.UNAUTHORIZED:
      return "UNAUTHORIZED";
    case PaymentErrorType.FORBIDDEN:
      return "FORBIDDEN";
    case PaymentErrorType.INVALID_AMOUNT:
    case PaymentErrorType.INVALID_PAYMENT_METHOD:
    case PaymentErrorType.INVALID_STATUS_TRANSITION:
      return "RESOURCE_CONFLICT";
    case PaymentErrorType.EVENT_NOT_FOUND:
    case PaymentErrorType.ATTENDANCE_NOT_FOUND:
    case PaymentErrorType.PAYMENT_NOT_FOUND:
      return "NOT_FOUND";
    case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
      return "RESOURCE_CONFLICT";
    case PaymentErrorType.DATABASE_ERROR:
      return "DATABASE_ERROR";
    case PaymentErrorType.STRIPE_API_ERROR:
    case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
    default:
      return "INTERNAL_ERROR";
  }
}

export async function createStripeSessionAction(
  input: unknown
): Promise<ServerActionResult<{ sessionUrl: string; sessionId: string }>> {
  try {
    // 入力検証
    const parsed = createStripeSessionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return createServerActionError("VALIDATION_ERROR", "入力データが無効です。", {
        details: { zodErrors: parsed.error.errors },
      });
    }

    const params = parsed.data;

    // 認証（RLS 下の認証クライアント）
    const factory = SecureSupabaseClientFactory.getInstance();
    const supabase = await factory.createAuthenticatedClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return createServerActionError("UNAUTHORIZED", "認証が必要です。");
    }

    // 公開エンドポイント用レート制限（ユーザー単位）
    try {
      const store = await createRateLimitStore();
      const rl = await checkRateLimit(
        store,
        `stripe_checkout_user_${user.id}`,
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
      // レート制限でのストア初期化失敗時はスキップ（安全側）
    }

    // 参加記録の存在確認と権限チェック、金額妥当性は Validator に集約（認証クライアント）
    const validator = new PaymentValidator(supabase);
    await validator.validateAttendanceAccess(params.attendanceId, user.id);
    await validator.validatePaymentAmount(params.amount);

    // イベント情報とStripe Connect情報を取得
    const { data: attendanceList, error: attendanceError } = await supabase
      .from("attendances")
      .select(
        `
        id,
        status,
        payments!left (
          method,
          status,
          paid_at,
          created_at,
          updated_at
        ),
        events!inner (
          id,
          title,
          fee,
          date,
          payment_deadline,
          status,
          created_by,
          stripe_connect_accounts (
            stripe_account_id,
            payouts_enabled
          )
        )
      `
      )
      .eq("id", params.attendanceId)
      .order("paid_at", { foreignTable: "payments", ascending: false, nullsFirst: false } as any)
      .order("created_at", { foreignTable: "payments", ascending: false } as any)
      .order("updated_at", { foreignTable: "payments", ascending: false } as any)
      .limit(1, { foreignTable: "payments" })
      .limit(1);

    if (attendanceError || !attendanceList || attendanceList.length === 0) {
      return createServerActionError("NOT_FOUND", "参加記録が見つかりません。");
    }
    if (attendanceList.length > 1) {
      return createServerActionError(
        "DATABASE_ERROR",
        "参加記録の整合性エラー: 複数件のレコードが見つかりました"
      );
    }

    type StripeConnectAccount = {
      stripe_account_id: string;
      payouts_enabled: boolean;
    };
    type EventLite = {
      id: string;
      title: string;
      fee: number | null;
      date: string;
      payment_deadline: string | null;
      status: string;
      created_by: string;
      stripe_connect_accounts: StripeConnectAccount | StripeConnectAccount[] | null;
    };
    type AttendanceWithEventAndPayment = {
      id: string;
      status: AttendanceStatus;
      payments?:
      | null
      | {
        method: string | null;
        status: string | null;
        paid_at?: string | null;
        created_at?: string;
        updated_at?: string;
      }
      | Array<{
        method: string | null;
        status: string | null;
        paid_at?: string | null;
        created_at?: string;
        updated_at?: string;
      }>;
      events: EventLite | EventLite[];
    };
    const attendance = attendanceList[0] as unknown as AttendanceWithEventAndPayment;
    const eventList = Array.isArray(attendance.events) ? attendance.events : [attendance.events];
    const event = eventList[0];
    if (!event) {
      return createServerActionError("NOT_FOUND", "イベントが見つかりません。");
    }

    // 決済許可条件の統一チェック（実データで判定）
    const payments = Array.isArray(attendance.payments)
      ? attendance.payments
      : attendance.payments
        ? [attendance.payments]
        : [];
    const latestPayment = payments[0] || null;

    const paymentStatus = latestPayment?.status && isValidPaymentStatus(latestPayment.status)
      ? latestPayment.status
      : null;
    const paymentMethod = latestPayment?.method ?? null;

    const eligibilityResult = canCreateStripeSession(
      {
        id: params.attendanceId,
        status: attendance.status,
        payment: latestPayment ? { method: paymentMethod, status: paymentStatus } : null,
      },
      {
        ...event,
        status: event.status as EventStatus,
      }
    );
    if (!eligibilityResult.isEligible) {
      return createServerActionError(
        "RESOURCE_CONFLICT",
        eligibilityResult.reason || "決済セッションの作成条件を満たしていません。"
      );
    }

    // 金額整合性
    if (params.amount !== event.fee) {
      return createServerActionError(
        "RESOURCE_CONFLICT",
        "指定された金額がイベントの参加費と一致しません。"
      );
    }

    const errorHandler = new PaymentErrorHandler();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "app/payments/actions/create-stripe-session"
    );
    const paymentService = new PaymentService(admin, errorHandler);

    // Destination charges 前提で Connect アカウント情報を取得
    const connectAccounts = Array.isArray(event.stripe_connect_accounts)
      ? event.stripe_connect_accounts
      : event.stripe_connect_accounts ? [event.stripe_connect_accounts] : [];

    const connectAccount = connectAccounts[0];

    if (!connectAccount) {
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

    // ユーザー情報を取得（Customer作成用）
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, display_name")
      .eq("id", user.id)
      .single();

    const destinationChargesConfig = {
      destinationAccountId: connectAccount.stripe_account_id,
      userEmail: profile?.email || user.email,
      userName: profile?.display_name,
    } as const;

    const result = await paymentService.createStripeSession({
      attendanceId: params.attendanceId,
      amount: params.amount,
      eventId: event.id,
      actorId: user.id,
      eventTitle: event.title,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      destinationCharges: destinationChargesConfig,
    });

    return createServerActionSuccess({ sessionUrl: result.sessionUrl, sessionId: result.sessionId });
  } catch (error) {
    if (error instanceof PaymentError) {
      return createServerActionError(mapPaymentError(error.type), error.message);
    }
    return createServerActionError("INTERNAL_ERROR", "予期しないエラーが発生しました", {
      details: { originalError: error },
    });
  }
}
