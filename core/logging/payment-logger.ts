/**
 * 決済専用ログコンテキスト
 * Connect Account関連エラーを含む決済処理の詳細ログを管理
 */

import { logger, type EventPayLogFields } from "./app-logger";

/** 決済エラーの分類 */
export type PaymentErrorClassification =
  | "user_error" // ユーザー起因のエラー（入力不備、カード拒否など）
  | "config_error" // 設定問題（Connect Account不存在・制限など）
  | "stripe_error" // Stripe API障害
  | "system_error"; // システム内部エラー

/** 決済ログ専用フィールド */
export interface PaymentLogFields extends EventPayLogFields {
  /** 決済ID */
  payment_id?: string;
  /** 参加記録ID */
  attendance_id?: string;
  /** Stripe Connect Account ID */
  connect_account_id?: string;
  /** 決済方法 */
  payment_method?: "stripe" | "cash";
  /** 金額（円） */
  amount?: number;
  /** Stripe チェックアウトセッションID */
  stripe_session_id?: string;
  /** Stripe PaymentIntent ID */
  stripe_payment_intent_id?: string;
  /** エラー分類 */
  error_classification?: PaymentErrorClassification;
  /** 復旧提案 */
  recovery_suggestions?: string[];
  /** 相関ID（追跡用） */
  correlation_id?: string;
  /** 決済処理フェーズ */
  payment_phase?: "validation" | "session_creation" | "webhook_processing" | "status_update";
}

/** 決済操作の種類 */
export type PaymentOperation =
  | "create_stripe_session"
  | "create_cash_payment"
  | "update_payment_status"
  | "bulk_update_payment_status"
  | "validate_connect_account"
  | "process_webhook";

/**
 * 決済エラーの分類を自動判定
 */
export function classifyPaymentError(error: unknown): PaymentErrorClassification {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();

  // Connect Account関連は設定問題
  if (
    lowerMessage.includes("connect account") ||
    lowerMessage.includes("no such on_behalf_of") ||
    lowerMessage.includes("account_restricted") ||
    lowerMessage.includes("payouts_enabled")
  ) {
    return "config_error";
  }

  // カード拒否などはユーザー問題
  if (
    lowerMessage.includes("card_declined") ||
    lowerMessage.includes("insufficient_funds") ||
    lowerMessage.includes("invalid_expiry") ||
    lowerMessage.includes("validation")
  ) {
    return "user_error";
  }

  // Stripe API障害
  if (
    lowerMessage.includes("stripe") &&
    (lowerMessage.includes("api") || lowerMessage.includes("connection"))
  ) {
    return "stripe_error";
  }

  // その他はシステムエラー
  return "system_error";
}

/**
 * エラー分類に基づく復旧提案を生成
 */
export function generateRecoverySuggestions(
  classification: PaymentErrorClassification,
  _context?: { hasConnectAccount?: boolean; paymentMethod?: string }
): string[] {
  switch (classification) {
    case "config_error":
      return [
        "主催者にStripeアカウント設定の確認を依頼",
        "現金決済への変更を案内",
        "設定完了後の再試行を案内",
      ];

    case "user_error":
      return ["入力内容の確認を案内", "別のカード利用を提案", "現金決済への変更を案内"];

    case "stripe_error":
      return ["しばらく待ってから再試行", "現金決済への変更を案内", "Stripeステータス確認"];

    case "system_error":
    default:
      return ["システム管理者への連絡", "現金決済への変更を案内", "再試行の案内"];
  }
}

/**
 * 決済専用ロガー
 * 構造化された決済ログを出力し、エラー追跡を容易にする
 */
export class PaymentLogger {
  private baseContext: PaymentLogFields;

  constructor(baseContext: Partial<PaymentLogFields> = {}) {
    this.baseContext = {
      category: "payment",
      action: "payment_operation",
      ...baseContext,
    } as PaymentLogFields;
  }

  /**
   * 決済操作の開始ログ
   */
  startOperation(operation: PaymentOperation, context: Partial<PaymentLogFields> = {}) {
    const logContext = {
      ...this.baseContext,
      ...context,
      payment_phase: "validation" as const,
      operation,
    };

    logger.info(`Payment operation started: ${operation}`, logContext as PaymentLogFields);
  }

  /**
   * 決済操作の成功ログ
   */
  operationSuccess(operation: PaymentOperation, context: Partial<PaymentLogFields> = {}) {
    const logContext = {
      ...this.baseContext,
      ...context,
      operation,
    };

    logger.info(`Payment operation completed: ${operation}`, {
      ...logContext,
      outcome: "success",
    } as PaymentLogFields);
  }

  /**
   * 決済エラーの詳細ログ
   * エラー分類と復旧提案を自動生成
   */
  logPaymentError(
    operation: PaymentOperation,
    error: unknown,
    context: Partial<PaymentLogFields> = {}
  ) {
    const errorClassification = classifyPaymentError(error);
    const recoverySuggestions = generateRecoverySuggestions(errorClassification, {
      hasConnectAccount: !!context.connect_account_id,
      paymentMethod: context.payment_method,
    });

    const logContext = {
      ...this.baseContext,
      ...context,
      error_classification: errorClassification,
      recovery_suggestions: recoverySuggestions,
      operation,
      error_name: error instanceof Error ? error.name : "Unknown",
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : undefined,
    };

    // 分類に基づいてログレベルを調整
    const logLevel = errorClassification === "system_error" ? "error" : "warn";

    const logMsg = `Payment operation failed: ${operation}`;
    const finalContext = { ...logContext, outcome: "failure" as const } as PaymentLogFields;

    if (logLevel === "error") {
      logger.error(logMsg, finalContext);
    } else {
      logger.warn(logMsg, finalContext);
    }
  }

  /**
   * Connect Account検証ログ
   */
  logConnectAccountValidation(
    accountId: string,
    isValid: boolean,
    context: Partial<PaymentLogFields> = {}
  ) {
    const logContext = {
      ...this.baseContext,
      ...context,
      connect_account_id: accountId,
      payment_phase: "validation" as const,
      validation_result: isValid,
    };

    if (isValid) {
      logger.info("Connect Account validation passed", {
        ...logContext,
        outcome: "success",
      } as PaymentLogFields);
    } else {
      logger.warn("Connect Account validation failed", {
        ...logContext,
        error_classification: "config_error" as const,
        recovery_suggestions: generateRecoverySuggestions("config_error"),
        outcome: "failure",
      } as PaymentLogFields);
    }
  }

  /**
   * 決済セッション作成ログ
   */
  logSessionCreation(
    success: boolean,
    context: Partial<
      PaymentLogFields & {
        session_url?: string;
        session_id?: string;
      }
    > = {}
  ) {
    const logContext = {
      ...this.baseContext,
      ...context,
      payment_phase: "session_creation" as const,
    };

    if (success) {
      logger.info("Payment session created successfully", {
        ...logContext,
        outcome: "success",
      } as PaymentLogFields);
    } else {
      logger.error("Payment session creation failed", {
        ...logContext,
        outcome: "failure",
      } as PaymentLogFields);
    }
  }

  /**
   * 決済ステータス更新ログ
   */
  logStatusUpdate(
    paymentId: string,
    oldStatus: string,
    newStatus: string,
    context: Partial<PaymentLogFields> = {}
  ) {
    const logContext = {
      ...this.baseContext,
      ...context,
      payment_id: paymentId,
      payment_phase: "status_update" as const,
      status_change: `${oldStatus} -> ${newStatus}`,
    };

    logger.info("Payment status updated", {
      ...logContext,
      outcome: "success",
    } as PaymentLogFields);
  }

  /**
   * 一括ステータス更新ログ
   */
  logBulkStatusUpdate(
    successCount: number,
    failureCount: number,
    context: Partial<PaymentLogFields> = {}
  ) {
    const logContext = {
      ...this.baseContext,
      ...context,
      payment_phase: "status_update" as const,
      bulk_update_success: successCount,
      bulk_update_failures: failureCount,
    };

    logger.info(`Bulk payment status update completed`, {
      ...logContext,
      outcome: failureCount === 0 ? "success" : "failure",
    } as PaymentLogFields);
  }

  /**
   * コンテキスト付きの子ロガーを作成
   */
  withContext(additionalContext: Partial<PaymentLogFields>): PaymentLogger {
    return new PaymentLogger({
      ...this.baseContext,
      ...additionalContext,
    });
  }

  // --- 標準のログメソッド ---

  debug(msg: string, context: Partial<PaymentLogFields> = {}) {
    logger.debug(msg, { ...this.baseContext, ...context } as PaymentLogFields);
  }

  info(msg: string, context: Partial<PaymentLogFields> = {}) {
    logger.info(msg, { ...this.baseContext, ...context } as PaymentLogFields);
  }

  warn(msg: string, context: Partial<PaymentLogFields> = {}) {
    logger.warn(msg, { ...this.baseContext, ...context } as PaymentLogFields);
  }

  error(msg: string, context: Partial<PaymentLogFields> = {}) {
    logger.error(msg, { ...this.baseContext, ...context } as PaymentLogFields);
  }

  critical(msg: string, context: Partial<PaymentLogFields> = {}) {
    logger.critical(msg, { ...this.baseContext, ...context } as PaymentLogFields);
  }
}

/**
 * デフォルト決済ロガーインスタンス
 */
export const paymentLogger = new PaymentLogger();

/**
 * 決済操作用の便利関数
 */
export function createPaymentLogger(context: Partial<PaymentLogFields>): PaymentLogger {
  return new PaymentLogger(context);
}
