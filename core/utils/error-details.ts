/**
 * EventPay エラー詳細定義と共通ユーティリティ
 * クライアント/サーバー両方で使用可能な純粋なTypeScriptコード
 */

import type { Database } from "@/types/database";

/** DB enum から型を取得 */
type ActorType = Database["public"]["Enums"]["actor_type_enum"];
type LogOutcome = Database["public"]["Enums"]["log_outcome_enum"];
type LogCategory = Database["public"]["Enums"]["log_category_enum"];

export interface ErrorDetails {
  code: string;
  message: string;
  userMessage: string;
  severity: "low" | "medium" | "high" | "critical";
  shouldLog: boolean;
  shouldAlert: boolean;
  retryable: boolean;
}

export interface ErrorContext {
  userAgent?: string;
  ip?: string;
  userId?: string;
  eventId?: string;
  action?: string;
  /** アクター種別（操作主体） */
  actorType?: ActorType;
  /** 処理結果 */
  outcome?: LogOutcome;
  /** ログカテゴリ */
  category?: LogCategory;
  /** 重要度の明示的な指定（オプション） */
  severity?: "low" | "medium" | "high" | "critical";
  additionalData?: Record<string, unknown>;
}

/**
 * エラーコードとユーザーメッセージのマッピング
 */
export const ERROR_MAPPINGS: Record<string, Omit<ErrorDetails, "code">> = {
  // 招待トークン関連エラー
  INVALID_TOKEN: {
    message: "Invalid invite token provided",
    userMessage: "無効な招待リンクです。正しいリンクをご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  TOKEN_NOT_FOUND: {
    message: "Invite token not found in database",
    userMessage: "招待リンクが見つかりません。リンクが正しいかご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  TOKEN_EXPIRED: {
    message: "Invite token has expired",
    userMessage: "招待リンクの有効期限が切れています。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  INVITE_TOKEN_INVALID: {
    message: "Invalid invite token provided",
    userMessage: "無効な招待リンクです。正しいリンクをご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  INVITE_TOKEN_NOT_FOUND: {
    message: "Invite token not found in database",
    userMessage: "招待リンクが見つかりません。リンクが正しいかご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },

  // イベント関連エラー
  EVENT_NOT_FOUND: {
    message: "Event not found",
    userMessage: "イベントが見つかりません。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  EVENT_CANCELED: {
    message: "Event has been canceled",
    userMessage: "このイベントはキャンセルされました。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },
  EVENT_ENDED: {
    message: "Event has already ended",
    userMessage: "このイベントは既に終了しています。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },
  REGISTRATION_DEADLINE_PASSED: {
    message: "Registration deadline has passed",
    userMessage: "参加申込期限が過ぎています。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },

  // 参加状況更新/登録時の定員超過（操作失敗）
  ATTENDANCE_CAPACITY_REACHED: {
    message: "Attendance update blocked due to capacity reached",
    userMessage: "イベントの定員に達しているため参加できません。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },

  // 参加登録関連エラー
  DUPLICATE_REGISTRATION: {
    message: "Duplicate registration attempt",
    userMessage: "このメールアドレスは既に登録されています。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },

  // 認証系（予期しないエラー - Sentry通知対象）
  REGISTRATION_UNEXPECTED_ERROR: {
    message: "User registration failed unexpectedly",
    userMessage: "登録処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LOGIN_UNEXPECTED_ERROR: {
    message: "Login failed unexpectedly",
    userMessage: "ログイン処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LOGIN_FAILED: {
    message: "Login failed (invalid credentials)",
    userMessage: "メールアドレスまたはパスワードが正しくありません。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  OTP_UNEXPECTED_ERROR: {
    message: "OTP verification failed unexpectedly",
    userMessage: "確認処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  RESEND_OTP_UNEXPECTED_ERROR: {
    message: "OTP resend failed unexpectedly",
    userMessage: "再送信処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  RESET_PASSWORD_UNEXPECTED_ERROR: {
    message: "Password reset request failed unexpectedly",
    userMessage: "パスワードリセット処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  UPDATE_PASSWORD_UNEXPECTED_ERROR: {
    message: "Password update failed unexpectedly",
    userMessage: "パスワード更新処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LOGOUT_UNEXPECTED_ERROR: {
    message: "Logout failed unexpectedly",
    userMessage: "ログアウト処理中にエラーが発生しました。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  PROFILE_UPDATE_UNEXPECTED_ERROR: {
    message: "Profile update failed unexpectedly",
    userMessage: "プロフィールの更新中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  EMAIL_UPDATE_UNEXPECTED_ERROR: {
    message: "Email update failed unexpectedly",
    userMessage: "メールアドレスの更新中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  ACCOUNT_DELETION_UNEXPECTED_ERROR: {
    message: "Account deletion failed unexpectedly",
    userMessage: "退会処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  VALIDATION_ERROR: {
    message: "Input validation failed",
    userMessage: "入力内容に問題があります。正しい形式で入力してください。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  INVALID_JSON: {
    message: "Invalid JSON in request body",
    userMessage: "リクエストの形式が正しくありません。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },

  // API Problem Details 対応エラーコードの補完
  UNAUTHORIZED: {
    message: "Unauthorized access",
    userMessage: "認証が必要です。ログインしてから再度お試しください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  FORBIDDEN: {
    message: "Forbidden",
    userMessage: "このリソースにアクセスする権限がありません。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  NOT_FOUND: {
    message: "Resource not found",
    userMessage: "指定されたリソースが見つかりません。",
    severity: "low",
    shouldLog: false,
    shouldAlert: false,
    retryable: false,
  },
  RESOURCE_CONFLICT: {
    message: "Resource conflict",
    userMessage: "リソースの競合が発生しました。しばらくしてから再度お試しください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  RATE_LIMITED: {
    message: "Rate limit exceeded",
    userMessage: "リクエストが多すぎます。しばらく待ってから再度お試しください。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  INTERNAL_ERROR: {
    message: "Internal server error",
    userMessage: "内部エラーが発生しました。しばらく時間をおいて再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // システムエラー
  DATABASE_ERROR: {
    message: "Database operation failed",
    userMessage: "データベースエラーが発生しました。しばらく時間をおいて再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  INTERNAL_SERVER_ERROR: {
    message: "Internal server error occurred",
    userMessage: "サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  NETWORK_ERROR: {
    message: "Network connection failed",
    userMessage: "ネットワークエラーが発生しました。インターネット接続をご確認ください。",
    severity: "medium",
    shouldLog: false,
    shouldAlert: false,
    retryable: true,
  },

  // セキュリティ関連エラー
  RATE_LIMIT_EXCEEDED: {
    message: "Rate limit exceeded",
    userMessage: "アクセス頻度が高すぎます。しばらく時間をおいて再度お試しください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  SUSPICIOUS_ACTIVITY: {
    message: "Suspicious activity detected",
    userMessage: "不正なアクセスが検出されました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  XSS_ATTEMPT: {
    message: "XSS attempt detected",
    userMessage: "不正な入力が検出されました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },

  // ゲストトークン関連エラー
  INVALID_GUEST_TOKEN: {
    message: "Invalid guest token provided",
    userMessage: "無効なアクセスです。正しいリンクをご確認ください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  GUEST_TOKEN_EXPIRED: {
    message: "Guest token has expired",
    userMessage: "アクセストークンの有効期限が切れています。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  GUEST_TOKEN_VALIDATION_FAILED: {
    message: "Guest token validation failed",
    userMessage: "参加データの取得中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },
  // 決済セッション作成失敗（ゲスト・主催者の区別なく共通利用）
  PAYMENT_SESSION_CREATION_FAILED: {
    message: "Payment session creation failed",
    userMessage: "決済セッションの作成に失敗しました。しばらくしてから再度お試しください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },

  // Stripe Connect関連エラー
  CONNECT_ACCOUNT_NOT_FOUND: {
    message: "Stripe Connect Account not found",
    userMessage:
      "決済の準備ができません。主催者のお支払い受付設定に不備があります。現金決済をご利用いただくか、主催者にお問い合わせください。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  CONNECT_ACCOUNT_RESTRICTED: {
    message: "Stripe Connect Account is restricted",
    userMessage:
      "主催者のお支払い受付が一時的に制限されています。現金決済をご利用いただくか、主催者にお問い合わせください。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  STRIPE_CONFIG_ERROR: {
    message: "Stripe configuration error",
    userMessage:
      "決済システムに一時的な問題が発生しています。しばらく時間をおいて再度お試しいただくか、現金決済をご利用ください。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // Webhook処理系エラー
  WEBHOOK_SYNC_PROCESSING_FAILED: {
    message: "Webhook synchronous processing failed",
    userMessage: "Webhook処理に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  WEBHOOK_QSTASH_FORWARDING_FAILED: {
    message: "QStash forwarding failed - webhook may be lost",
    userMessage: "Webhook転送に失敗しました。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  WEBHOOK_CONFIG_ERROR: {
    message: "Webhook configuration error",
    userMessage: "Webhook設定エラーが発生しました。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  WEBHOOK_UNEXPECTED_ERROR: {
    message: "Unexpected error in webhook processing",
    userMessage: "Webhook処理中に予期しないエラーが発生しました。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  WEBHOOK_PAYMENT_NOT_FOUND: {
    message: "Payment record not found for webhook event",
    userMessage: "決済レコードが見つかりません。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  WEBHOOK_INVALID_PAYLOAD: {
    message: "Invalid webhook payload",
    userMessage: "Webhookペイロードが不正です。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  WEBHOOK_DUPLICATE_EVENT: {
    message: "Duplicate webhook event detected",
    userMessage: "重複したWebhookイベントです。",
    severity: "low",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  SETTLEMENT_REGENERATE_FAILED: {
    message: "Failed to regenerate settlement report",
    userMessage: "精算レポートの再生成に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  GA4_TRACKING_FAILED: {
    message: "Failed to send GA4 event",
    userMessage: "GA4イベント送信に失敗しました。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },

  // LINEログイン関連エラー
  LINE_LOGIN_ERROR: {
    message: "LINE login failed unexpectedly",
    userMessage: "LINEログイン処理中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LINE_CSRF_VALIDATION_FAILED: {
    message: "LINE login CSRF validation failed",
    userMessage: "認証セッションが正しくありません。最初からやり直してください。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: false,
  },
  LINE_TOKEN_RETRIEVAL_FAILED: {
    message: "Failed to retrieve ID token from LINE",
    userMessage: "LINEからの認証情報の取得に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LINE_PROFILE_ERROR: {
    message: "Failed to retrieve user profile from LINE",
    userMessage: "LINEのプロフィール情報の取得に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  LINE_ACCOUNT_LINKING_FAILED: {
    message: "Failed to link LINE account",
    userMessage: "LINEアカウントの連携に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // Connect Webhookエラー
  CONNECT_WEBHOOK_ACCOUNT_UPDATED_ERROR: {
    message: "Error handling Connect account.updated event",
    userMessage: "Connectアカウント更新処理に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  CONNECT_WEBHOOK_DEAUTHORIZED_ERROR: {
    message: "Error handling Connect account deauthorization",
    userMessage: "Connect連携解除処理に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  CONNECT_WEBHOOK_PAYOUT_ERROR: {
    message: "Error handling Connect payout event",
    userMessage: "振込イベント処理に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  CONNECT_WEBHOOK_NOTIFICATION_ERROR: {
    message: "Error sending Connect webhook notification",
    userMessage: "通知送信に失敗しました。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false, // 通知自体の失敗はアラートしない（ループ防止）
    retryable: true,
  },
  AUDIT_LOG_RECORDING_FAILED: {
    message: "Failed to record audit log",
    userMessage: "監査ログの記録に失敗しました。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false,
    retryable: true,
  },

  // 決済セッション関連
  PAYMENT_SESSION_REGISTRATION_FAILED: {
    message: "PaymentService registration failed",
    userMessage: "決済サービスの初期化に失敗しました。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // ゲストアクション
  GUEST_ATTENDANCE_UPDATE_ERROR: {
    message: "Guest attendance update failed unexpectedly",
    userMessage: "参加情報の更新中にエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  PAYMENT_COMPLETION_NOTIFICATION_FAILED: {
    message: "Failed to send payment completion notification",
    userMessage: "決済完了通知の送信に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  STRIPE_CHECKOUT_SESSION_EXPIRED_UPDATE_FAILED: {
    message: "Failed to update payment on checkout.session.expired",
    userMessage: "セッション期限切れ処理に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // インフラ・設定関連エラー
  ENV_VAR_MISSING: {
    message: "Required environment variable is missing",
    userMessage: "システム設定エラーが発生しました。",
    severity: "critical",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  CRON_EXECUTION_ERROR: {
    message: "Cron job execution failed",
    userMessage: "定期実行ジョブでエラーが発生しました。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // セキュリティシステムエラー
  ACCOUNT_LOCKOUT_SYSTEM_ERROR: {
    message: "Account lockout system failed (Redis/DB)",
    userMessage: "アカウントロックアウトシステムでエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },

  // 通知関連エラー
  EMAIL_SENDING_FAILED: {
    message: "Failed to send email",
    userMessage: "メール送信に失敗しました。",
    severity: "medium",
    shouldLog: true,
    shouldAlert: false, // 再試行済みまたは一時的エラーの場合は通知しない
    retryable: true,
  },
  ADMIN_ALERT_FAILED: {
    message: "Failed to send admin alert",
    userMessage: "管理者への通知に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  EVENT_DISPATCH_ERROR: {
    message: "Internal event dispatch failed",
    userMessage: "システム内イベントの配信に失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  STRIPE_CONNECT_SERVICE_ERROR: {
    message: "Stripe Connect service operation failed",
    userMessage: "Stripe Connect連携処理でエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  STRIPE_CONNECT_ACCOUNT_NOT_FOUND: {
    message: "Stripe Connect account not found",
    userMessage: "Stripe Connectアカウントが見つかりません。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
  SETTLEMENT_REPORT_FAILED: {
    message: "Settlement report generation or export failed",
    userMessage: "清算レポートの生成またはエクスポートに失敗しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  EVENT_OPERATION_FAILED: {
    message: "Event-related operation failed",
    userMessage: "イベント関連の処理でエラーが発生しました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: true,
  },
  SECURITY_EVENT_DETECTED: {
    message: "Security event detected",
    userMessage: "セキュリティイベントが検出されました。",
    severity: "high",
    shouldLog: true,
    shouldAlert: true,
    retryable: false,
  },
};

/**
 * エラーコードからエラー詳細を取得
 * @param code エラーコード
 * @returns エラー詳細
 */
export function getErrorDetails(code: string): ErrorDetails {
  const mapping = ERROR_MAPPINGS[code];
  if (!mapping) {
    return {
      code: "UNKNOWN_ERROR",
      message: `Unknown error code: ${code}`,
      userMessage: "予期しないエラーが発生しました。",
      severity: "medium",
      shouldLog: true,
      shouldAlert: false,
      retryable: true,
    };
  }

  return {
    code,
    ...mapping,
  };
}

/**
 * エラーからユーザーフレンドリーなメッセージを取得
 * @param error エラーオブジェクト
 * @param fallbackMessage フォールバックメッセージ
 * @returns ユーザーメッセージ
 */
export function getUserErrorMessage(
  error: unknown,
  fallbackMessage = "エラーが発生しました"
): string {
  if (typeof error === "string") {
    const details = getErrorDetails(error);
    return details.userMessage;
  }

  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    const details = getErrorDetails(error.code);
    return details.userMessage;
  }

  if (error instanceof Error) {
    // 開発環境では詳細なエラーメッセージを表示
    if (process.env.NODE_ENV === "development") {
      return error.message;
    }
  }

  return fallbackMessage;
}

/**
 * APIエラーレスポンスを処理
 * @param response Fetch Response
 * @returns エラー詳細
 */
export async function handleApiError(response: Response): Promise<ErrorDetails> {
  // Problem Details 優先でエラーコードを判定
  try {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/problem+json")) {
      const problem = (await response.json()) as Record<string, unknown>;
      const code = typeof problem?.code === "string" ? problem.code : "UNKNOWN_ERROR";
      return getErrorDetails(code);
    }

    // 非 Problem Details の JSON でも code や message を尊重
    if (contentType.includes("application/json")) {
      const body = (await response.json()) as Record<string, unknown>;
      const code = typeof body?.code === "string" ? body.code : undefined;
      if (code) return getErrorDetails(code);
    }
  } catch {
    // 何もしない（後段でHTTPステータスから推測）
  }

  // フォールバック: HTTP ステータスから推測
  let fallback = "UNKNOWN_ERROR";
  switch (response.status) {
    case 400:
      fallback = "VALIDATION_ERROR";
      break;
    case 401:
      fallback = "UNAUTHORIZED";
      break;
    case 403:
      fallback = "FORBIDDEN";
      break;
    case 404:
      fallback = "NOT_FOUND";
      break;
    case 409:
      fallback = "RESOURCE_CONFLICT";
      break;
    case 410:
      fallback = "EVENT_ENDED"; // 代表的な410を便宜的にマップ（UI側で適宜上書き可）
      break;
    case 422:
      fallback = "VALIDATION_ERROR";
      break;
    case 429:
      fallback = "RATE_LIMITED";
      break;
    case 500:
      fallback = "INTERNAL_ERROR";
      break;
  }
  return getErrorDetails(fallback);
}

/**
 * エラーが再試行可能かどうかを判定
 * @param error エラー詳細
 * @returns 再試行可能かどうか
 */
export function isRetryableError(error: ErrorDetails): boolean {
  return error.retryable;
}

/**
 * エラーの重要度を取得
 * @param error エラー詳細
 * @returns 重要度
 */
export function getErrorSeverity(error: ErrorDetails): "low" | "medium" | "high" | "critical" {
  return error.severity;
}

/**
 * 任意のエラーを ErrorDetails に正規化（共通ロジック）
 * クライアント/サーバー両方で使用可能
 * @param error 任意のエラーオブジェクト
 * @returns 正規化されたエラー詳細
 */
export function normalizeToErrorDetails(error: unknown): ErrorDetails {
  // 既知のエラーコード文字列
  if (typeof error === "string") {
    return getErrorDetails(error);
  }

  // code プロパティを持つオブジェクト
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return getErrorDetails(error.code);
  }

  // Supabase AuthError / 一般的なエラーオブジェクト
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message: string }).message;
    if (msg.includes("already registered")) {
      return getErrorDetails("DUPLICATE_REGISTRATION");
    }
    if (msg.includes("rate limit")) {
      return getErrorDetails("RATE_LIMIT_EXCEEDED");
    }
    if (msg.includes("Email not confirmed")) {
      return getErrorDetails("VALIDATION_ERROR");
    }
    if (msg.includes("Invalid login credentials")) {
      return getErrorDetails("LOGIN_FAILED");
    }
  }

  return getErrorDetails("UNKNOWN_ERROR");
}
