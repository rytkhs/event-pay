/**
 * 汎用Stripeエラーハンドラー
 * Stripe APIエラーの統一的な処理と分類を提供
 */

import "server-only";

import Stripe from "stripe";

import { type PaymentErrorClassification, PaymentLogger } from "@core/logging/payment-logger";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

/** Stripeエラー分析結果 */
interface StripeErrorAnalysis {
  /** 元のStripeエラー */
  originalError: Stripe.errors.StripeError;
  /** 分類されたPaymentErrorType */
  paymentErrorType: PaymentErrorType;
  /** エラー分類 */
  classification: PaymentErrorClassification;
  /** リトライ可能性 */
  retryable: boolean;
  /** 推定される解決策 */
  resolutionHints: string[];
  /** ユーザー向けメッセージ */
  userMessage: string;
  /** 重要度 */
  severity: "low" | "medium" | "high" | "critical";
}

/** Stripeエラーハンドリングコンテキスト */
export interface StripeErrorContext {
  /** 操作名 */
  operation?: string;
  /** Connect Account ID */
  connectAccountId?: string;
  /** 決済ID */
  paymentId?: string;
  /** セッションID */
  sessionId?: string;
  /** 金額 */
  amount?: number;
  /** 追加コンテキスト */
  additionalData?: Record<string, unknown>;
}

/**
 * StripeエラーからPaymentErrorTypeへの分類マッピング
 * issue107で指摘された「No such on_behalf_of」などの具体的なケースに対応
 */
function classifyStripeError(error: Stripe.errors.StripeError): {
  type: PaymentErrorType;
  classification: PaymentErrorClassification;
  retryable: boolean;
  severity: "low" | "medium" | "high" | "critical";
} {
  const { type: stripeErrorType, code, message } = error;
  const lowerMessage = message?.toLowerCase() || "";

  // Stripe エラータイプを文字列として扱うためのヘルパー
  const errorType = String(stripeErrorType);

  // Connect Account関連エラーの詳細分類
  if (lowerMessage.includes("no such on_behalf_of")) {
    return {
      type: PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND,
      classification: "config_error",
      retryable: false,
      severity: "critical",
    };
  }

  if (code === "account_restricted" || lowerMessage.includes("account is restricted")) {
    return {
      type: PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED,
      classification: "config_error",
      retryable: false,
      severity: "high",
    };
  }

  if (
    lowerMessage.includes("payouts_enabled") ||
    lowerMessage.includes("charges_enabled") ||
    lowerMessage.includes("connect account")
  ) {
    return {
      type: PaymentErrorType.STRIPE_CONFIG_ERROR,
      classification: "config_error",
      retryable: false,
      severity: "high",
    };
  }

  // カード決済関連エラー
  if (errorType === "card_error") {
    switch (code) {
      case "card_declined":
      case "generic_decline":
      case "pickup_card":
      case "restricted_card":
      case "security_violation":
      case "service_not_allowed":
      case "stolen_card":
      case "stop_payment_order":
        return {
          type: PaymentErrorType.CARD_DECLINED,
          classification: "user_error",
          retryable: false,
          severity: "medium",
        };

      case "insufficient_funds":
        return {
          type: PaymentErrorType.INSUFFICIENT_FUNDS,
          classification: "user_error",
          retryable: false,
          severity: "medium",
        };

      case "invalid_expiry_month":
      case "invalid_expiry_year":
      case "invalid_number":
      case "invalid_cvc":
      case "incomplete_number":
      case "incomplete_expiry":
      case "incomplete_cvc":
        return {
          type: PaymentErrorType.VALIDATION_ERROR,
          classification: "user_error",
          retryable: false,
          severity: "low",
        };

      default:
        return {
          type: PaymentErrorType.CARD_DECLINED,
          classification: "user_error",
          retryable: false,
          severity: "medium",
        };
    }
  }

  // API・認証関連エラー
  if (errorType === "authentication_error") {
    return {
      type: PaymentErrorType.UNAUTHORIZED,
      classification: "config_error",
      retryable: false,
      severity: "critical",
    };
  }

  if (errorType === "permission_error") {
    return {
      type: PaymentErrorType.FORBIDDEN,
      classification: "config_error",
      retryable: false,
      severity: "high",
    };
  }

  // レート制限・一時的エラー
  if (errorType === "rate_limit_error") {
    return {
      type: PaymentErrorType.STRIPE_API_ERROR,
      classification: "stripe_error",
      retryable: true,
      severity: "medium",
    };
  }

  // リクエストエラー
  if (errorType === "invalid_request_error") {
    // 設定問題かリクエスト内容の問題かを判別
    if (
      lowerMessage.includes("account") ||
      lowerMessage.includes("connect") ||
      lowerMessage.includes("webhook")
    ) {
      return {
        type: PaymentErrorType.STRIPE_CONFIG_ERROR,
        classification: "config_error",
        retryable: false,
        severity: "high",
      };
    }

    return {
      type: PaymentErrorType.VALIDATION_ERROR,
      classification: "user_error",
      retryable: false,
      severity: "low",
    };
  }

  // API・接続エラー
  if (errorType === "api_connection_error" || errorType === "api_error") {
    return {
      type: PaymentErrorType.STRIPE_API_ERROR,
      classification: "stripe_error",
      retryable: true,
      severity: "medium",
    };
  }

  // Idempotency関連（通常は無害）
  if (errorType.includes("idempotency")) {
    return {
      type: PaymentErrorType.STRIPE_API_ERROR,
      classification: "system_error",
      retryable: false,
      severity: "low",
    };
  }

  // その他・不明なエラー
  return {
    type: PaymentErrorType.STRIPE_API_ERROR,
    classification: "system_error",
    retryable: true,
    severity: "medium",
  };
}

/**
 * エラー分類に基づく解決策のヒントを生成
 */
function generateResolutionHints(
  classification: PaymentErrorClassification,
  paymentErrorType: PaymentErrorType,
  _context?: StripeErrorContext
): string[] {
  switch (classification) {
    case "config_error":
      if (paymentErrorType === PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND) {
        return ["Stripeアカウント設定を確認", "アカウントの存在確認", "現金決済への切り替えを案内"];
      }
      if (paymentErrorType === PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED) {
        return [
          "アカウントの制限理由を確認",
          "Stripeダッシュボードでの制限解除作業",
          "現金決済への切り替えを案内",
        ];
      }
      return ["Stripe設定の確認", "API key・webhook設定の検証", "システム管理者への連絡"];

    case "user_error":
      if (paymentErrorType === PaymentErrorType.CARD_DECLINED) {
        return ["別のカードでの再試行", "カード会社への確認", "現金決済への切り替え"];
      }
      return ["入力内容の確認", "正しい情報での再入力", "別の決済方法の利用"];

    case "stripe_error":
      return [
        "しばらく時間をおいて再試行",
        "Stripeステータスページの確認",
        "現金決済への一時切り替え",
      ];

    case "system_error":
    default:
      return ["システム管理者への報告", "エラーログの詳細確認", "現金決済での代替対応"];
  }
}

/**
 * ユーザー向けメッセージを生成
 */
function generateUserMessage(
  classification: PaymentErrorClassification,
  paymentErrorType: PaymentErrorType
): string {
  switch (paymentErrorType) {
    case PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND:
      return "オンライン決済の準備ができていません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";

    case PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED:
      return "現在オンライン決済がご利用いただけません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";

    case PaymentErrorType.STRIPE_CONFIG_ERROR:
      return "決済システムの設定に問題があります。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。";

    case PaymentErrorType.CARD_DECLINED:
      return "カードが拒否されました。別のカードをお試しいただくか、現金決済をご利用ください。";

    case PaymentErrorType.INSUFFICIENT_FUNDS:
      return "残高不足のため決済できませんでした。別のカードをお試しいただくか、現金決済をご利用ください。";

    case PaymentErrorType.VALIDATION_ERROR:
      return "入力内容に誤りがあります。カード情報をご確認の上、もう一度お試しください。";

    case PaymentErrorType.UNAUTHORIZED:
    case PaymentErrorType.FORBIDDEN:
      return "アクセス権限に問題があります。しばらく時間をおいて再度お試しください。";

    case PaymentErrorType.STRIPE_API_ERROR:
      if (classification === "stripe_error") {
        return "決済サービスに一時的な問題が発生しています。しばらく時間をおいて再度お試しいただくか、現金決済をご利用ください。";
      }
      return "決済処理中にエラーが発生しました。もう一度お試しいただくか、現金決済をご利用ください。";

    default:
      return "決済処理中にエラーが発生しました。しばらく時間をおいて再度お試しいただくか、現金決済をご利用ください。";
  }
}

/**
 * 汎用Stripeエラーハンドラー
 * issue107で指摘された問題を解決する中核機能
 */
class StripeErrorHandler {
  private paymentLogger = new PaymentLogger({ service: "StripeErrorHandler" });

  /**
   * StripeエラーをPaymentErrorに変換し、詳細分析を実行
   */
  handleStripeError(error: Stripe.errors.StripeError, context?: StripeErrorContext): PaymentError {
    const analysis = this.analyzeStripeError(error, context);

    // 構造化ログでエラーを記録
    const logContext = {
      stripe_request_id: error.requestId,
      error_classification: analysis.classification,
      payment_error_type: analysis.paymentErrorType,
      severity: analysis.severity,
      retryable: analysis.retryable,
      resolution_hints: analysis.resolutionHints,
      connect_account_id: context?.connectAccountId,
      payment_id: context?.paymentId,
      stripe_session_id: context?.sessionId,
      amount: context?.amount,
      operation: context?.operation,
      stripe_error_code: error.code,
      stripe_error_type: error.type,
      ...context?.additionalData,
    };

    this.paymentLogger.logPaymentError(
      (context?.operation as any) || "stripe_api_call",
      error,
      logContext
    );

    // PaymentErrorオブジェクトを作成
    return new PaymentError(analysis.paymentErrorType, analysis.userMessage, error);
  }

  /**
   * Stripeエラーの詳細分析
   */
  private analyzeStripeError(
    error: Stripe.errors.StripeError,
    context?: StripeErrorContext
  ): StripeErrorAnalysis {
    const classification = classifyStripeError(error);
    const resolutionHints = generateResolutionHints(
      classification.classification,
      classification.type,
      context
    );
    const userMessage = generateUserMessage(classification.classification, classification.type);

    return {
      originalError: error,
      paymentErrorType: classification.type,
      classification: classification.classification,
      retryable: classification.retryable,
      resolutionHints,
      userMessage,
      severity: classification.severity,
    };
  }
}

/**
 * デフォルトエラーハンドラーインスタンス
 */
const stripeErrorHandler = new StripeErrorHandler();

/**
 * 便利関数: StripeエラーをPaymentErrorに変換
 */
export function convertStripeError(
  error: Stripe.errors.StripeError,
  context?: StripeErrorContext
): PaymentError {
  return stripeErrorHandler.handleStripeError(error, context);
}
