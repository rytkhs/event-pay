"use server";

import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import { PaymentService, PaymentErrorHandler, PaymentValidator } from "@/lib/services/payment";
import { getTransferGroupForEvent } from "@/lib/utils/stripe";
import { createRateLimitStore, checkRateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { createStripeSessionRequestSchema } from "@/lib/services/payment/validation";
import { PaymentError, PaymentErrorType } from "@/lib/services/payment/types";
import {
  type ServerActionResult,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  type ErrorCode,
} from "@/lib/types/server-actions";

function mapPaymentError(type: PaymentErrorType): ErrorCode {
  switch (type) {
    case PaymentErrorType.VALIDATION_ERROR:
      return ERROR_CODES.VALIDATION_ERROR;
    case PaymentErrorType.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHORIZED;
    case PaymentErrorType.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case PaymentErrorType.INVALID_AMOUNT:
    case PaymentErrorType.INVALID_PAYMENT_METHOD:
    case PaymentErrorType.INVALID_STATUS_TRANSITION:
      return ERROR_CODES.BUSINESS_RULE_VIOLATION;
    case PaymentErrorType.EVENT_NOT_FOUND:
    case PaymentErrorType.ATTENDANCE_NOT_FOUND:
    case PaymentErrorType.PAYMENT_NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case PaymentErrorType.PAYMENT_ALREADY_EXISTS:
      return ERROR_CODES.CONFLICT;
    case PaymentErrorType.DATABASE_ERROR:
      return ERROR_CODES.DATABASE_ERROR;
    case PaymentErrorType.STRIPE_API_ERROR:
    case PaymentErrorType.WEBHOOK_PROCESSING_ERROR:
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}

export async function createStripeSessionAction(
  input: unknown
): Promise<ServerActionResult<{ sessionUrl: string; sessionId: string }>> {
  try {
    // 入力検証
    const parsed = createStripeSessionRequestSchema.safeParse(input);
    if (!parsed.success) {
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, "入力データが無効です。", {
        zodErrors: parsed.error.errors,
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
      return createErrorResponse(ERROR_CODES.UNAUTHORIZED, "認証が必要です。");
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
        return createErrorResponse(
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
          "Stripe Checkout セッションの作成回数が上限に達しました。しばらく待ってから再試行してください。",
          rl.retryAfter ? { retryAfter: rl.retryAfter } : undefined
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
        events!inner (
          id,
          title,
          fee,
          created_by,
          stripe_connect_accounts (
            stripe_account_id,
            charges_enabled,
            payouts_enabled
          )
        )
      `
      )
      .eq("id", params.attendanceId)
      .limit(1);

    if (attendanceError || !attendanceList || attendanceList.length === 0) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "参加記録が見つかりません。");
    }
    if (attendanceList.length > 1) {
      return createErrorResponse(
        ERROR_CODES.DATABASE_ERROR,
        "参加記録の整合性エラー: 複数件のレコードが見つかりました"
      );
    }

    type StripeConnectAccount = {
      stripe_account_id: string;
      charges_enabled: boolean;
      payouts_enabled: boolean;
    };
    type EventLite = {
      id: string;
      title: string;
      fee: number | null;
      created_by: string;
      stripe_connect_accounts: StripeConnectAccount | StripeConnectAccount[] | null;
    };
    type AttendanceWithEvent = { id: string; events: EventLite | EventLite[] };
    const attendance = attendanceList[0] as unknown as AttendanceWithEvent;
    const eventList = Array.isArray(attendance.events) ? attendance.events : [attendance.events];
    const event = eventList[0];
    if (!event) {
      return createErrorResponse(ERROR_CODES.NOT_FOUND, "イベントが見つかりません。");
    }

    // 金額整合性
    if (params.amount !== event.fee) {
      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
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
      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        "このイベントにはStripe Connectアカウントが設定されていません。"
      );
    }

    if (!connectAccount.payouts_enabled) {
      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
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

    // Transfer Group（両方のフローで使用）
    const transferGroup = getTransferGroupForEvent(event.id);

    const result = await paymentService.createStripeSession({
      attendanceId: params.attendanceId,
      amount: params.amount,
      eventId: event.id,
      userId: user.id,
      eventTitle: event.title,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      transferGroup,
      destinationCharges: destinationChargesConfig,
    });

    return createSuccessResponse({ sessionUrl: result.sessionUrl, sessionId: result.sessionId });
  } catch (error) {
    if (error instanceof PaymentError) {
      return createErrorResponse(mapPaymentError(error.type), error.message);
    }
    return createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "予期しないエラーが発生しました", {
      originalError: error,
    });
  }
}
