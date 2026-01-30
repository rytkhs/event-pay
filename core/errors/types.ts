/**
 * Error Core Types
 * システム全体のエラー型定義
 */

// エラー重要度
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

// エラーカテゴリ
export type ErrorCategory =
  | "system" // システム内部エラー (DB, Network, etc)
  | "business" // ビジネスロジックエラー (在庫切れ, 期限切れ, etc)
  | "validation" // 入力検証エラー
  | "auth" // 認証・認可関連
  | "payment" // 決済関連
  | "external" // 外部サービスエラー
  | "not-found" // リソース不在
  | "security" // セキュリティ関連
  | "unknown"; // 分類不能

// 共通エラーコード定義 (HTTPステータスやビジネスルールを包括)
// 既存実装 (problem-details.ts, error-details.ts, error-types.ts) のスーパーセット
export type ErrorCode =
  // --- 認証・認可 (401/403) ---
  | "UNAUTHORIZED" // 認証が必要
  | "FORBIDDEN" // 権限がない
  | "TOKEN_INVALID" // トークンが無効
  | "TOKEN_EXPIRED" // トークン期限切れ
  | "TOKEN_NOT_FOUND" // トークンが見つからない
  | "GUEST_TOKEN_INVALID" // ゲストトークン無効
  | "GUEST_TOKEN_NOT_FOUND" // ゲストトークンなし
  | "GUEST_TOKEN_EXPIRED" // ゲストトークン期限切れ
  | "GUEST_TOKEN_VALIDATION_FAILED" // ゲストトークン検証失敗
  | "INVITE_TOKEN_INVALID" // 招待トークン無効
  | "INVITE_TOKEN_NOT_FOUND" // 招待トークンなし
  | "OTP_INVALID" // ワンタイムパスワード無効
  | "OTP_EXPIRED" // ワンタイムパスワード期限切れ
  | "LOGIN_FAILED" // ログイン失敗（認証情報不備）

  // --- Auth Actions (Unexpected) ---
  | "REGISTRATION_UNEXPECTED_ERROR"
  | "LOGIN_UNEXPECTED_ERROR"
  | "OTP_UNEXPECTED_ERROR"
  | "RESEND_OTP_UNEXPECTED_ERROR"
  | "RESET_PASSWORD_UNEXPECTED_ERROR"
  | "UPDATE_PASSWORD_UNEXPECTED_ERROR"
  | "LOGOUT_UNEXPECTED_ERROR"
  | "PROFILE_UPDATE_UNEXPECTED_ERROR"
  | "EMAIL_UPDATE_UNEXPECTED_ERROR"
  | "ACCOUNT_DELETION_UNEXPECTED_ERROR"

  // --- LINE Login ---
  | "LINE_LOGIN_ERROR"
  | "LINE_CSRF_VALIDATION_FAILED"
  | "LINE_TOKEN_RETRIEVAL_FAILED"
  | "LINE_PROFILE_ERROR"
  | "LINE_ACCOUNT_LINKING_FAILED"

  // --- 入力・リクエスト (400/405/422) ---
  | "INVALID_REQUEST" // 不正なリクエスト
  | "METHOD_NOT_ALLOWED" // 許可されていないメソッド (405)
  | "VALIDATION_ERROR" // 入力バリデーションエラー
  | "MISSING_PARAMETER" // 必須パラメータ不足
  | "INVALID_FORMAT" // フォーマット不正
  | "INVALID_JSON" // JSON形式不正

  // --- リソース (404/409) ---
  | "NOT_FOUND" // リソースが見つからない
  | "RESOURCE_CONFLICT" // リソース競合
  | "ALREADY_EXISTS" // 既に存在する

  // --- イベント (Business) ---
  | "EVENT_NOT_FOUND" // イベントなし
  | "EVENT_CANCELED" // イベント中止
  | "EVENT_ENDED" // イベント終了
  | "EVENT_FULL" // 満席
  | "EVENT_ACCESS_DENIED" // アクセス権限なし
  | "EVENT_DELETE_RESTRICTED" // 削除制限（参加者あり等）
  | "EVENT_DELETE_FAILED" // 削除失敗
  | "EVENT_INVALID_ID" // ID形式不正
  | "EVENT_OPERATION_FAILED" // イベント操作全般失敗
  | "EVENT_DISPATCH_ERROR" // 内部イベント配信失敗

  // --- 参加・登録 (Business) ---
  | "REGISTRATION_CLOSED" // 申込終了
  | "REGISTRATION_DEADLINE_PASSED" // 申込期限切れ
  | "DUPLICATE_REGISTRATION" // 二重登録
  | "ATTENDANCE_NOT_FOUND" // 参加データなし
  | "ATTENDANCE_CAPACITY_REACHED" // 定員到達
  | "ATTENDANCE_DEADLINE_PASSED" // 変更期限切れ
  | "ATTENDANCE_STATUS_ALREADY_UPDATED" // 既に更新済み
  | "ATTENDANCE_STATUS_ROLLBACK_REJECTED" // ロールバック不可
  | "GUEST_ATTENDANCE_UPDATE_ERROR" // ゲスト参加更新失敗

  // --- 決済 (Payment) ---
  | "PAYMENT_FAILED" // 決済失敗
  | "PAYMENT_PROCESSING_ERROR" // 処理中エラー
  | "PAYMENT_SESSION_NOT_FOUND" // セッションなし
  | "PAYMENT_SESSION_OUTDATED" // セッション期限切れ
  | "PAYMENT_SESSION_CREATION_FAILED" // セッション作成失敗
  | "PAYMENT_SESSION_REGISTRATION_FAILED" // PaymentService初期化失敗
  | "PAYMENT_COMPLETION_NOTIFICATION_FAILED" // 完了通知失敗
  | "INSUFFICIENT_BALANCE" // 残高不足
  | "CARD_ERROR" // カードエラー
  | "SETTLEMENT_REPORT_FAILED" // 清算レポート失敗
  | "SETTLEMENT_REGENERATE_FAILED" // 清算レポート再生成失敗

  // --- Stripe Connect ---
  | "CONNECT_ACCOUNT_NOT_FOUND" // 連携アカウントなし
  | "CONNECT_ACCOUNT_RESTRICTED" // アカウント制限中
  | "STRIPE_CONFIG_ERROR" // 設定ミス
  | "STRIPE_CONNECT_SERVICE_ERROR" // Connectサービス操作失敗
  | "STRIPE_CHECKOUT_SESSION_EXPIRED_UPDATE_FAILED" // 期限切れ処理失敗

  // --- Webhook ---
  | "WEBHOOK_SIGNATURE_VERIFICATION_FAILED"
  | "WEBHOOK_SYNC_PROCESSING_FAILED"
  | "WEBHOOK_QSTASH_FORWARDING_FAILED"
  | "WEBHOOK_CONFIG_ERROR"
  | "WEBHOOK_UNEXPECTED_ERROR"
  | "WEBHOOK_PAYMENT_NOT_FOUND"
  | "WEBHOOK_INVALID_PAYLOAD"
  | "WEBHOOK_DUPLICATE_EVENT"
  | "CONNECT_WEBHOOK_ACCOUNT_UPDATED_ERROR"
  | "CONNECT_WEBHOOK_DEAUTHORIZED_ERROR"
  | "CONNECT_WEBHOOK_PAYOUT_ERROR"
  | "CONNECT_WEBHOOK_NOTIFICATION_ERROR"

  // --- セキュリティ ---
  | "SUSPICIOUS_ACTIVITY" // 不審なアクティビティ
  | "XSS_ATTEMPT" // XSS試行
  | "SECURITY_EVENT_DETECTED" // 汎用セキュリティ検知
  | "ACCOUNT_LOCKOUT_SYSTEM_ERROR" // ロックアウト機能不全

  // --- システム・基盤 (500/502/503/429) ---
  | "INTERNAL_ERROR" // 内部エラー
  | "DATABASE_ERROR" // DBエラー
  | "EXTERNAL_SERVICE_ERROR" // 外部サービスエラー
  | "RATE_LIMITED" // レート制限
  | "MAINTENANCE" // メンテナンス中
  | "NETWORK_ERROR" // 通信エラー
  | "TIMEOUT_ERROR" // タイムアウト
  | "ENV_VAR_MISSING" // 環境変数不足
  | "CRON_EXECUTION_ERROR" // 定期実行ジョブエラー
  | "AUDIT_LOG_RECORDING_FAILED" // 監査ログ記録失敗
  | "EMAIL_SENDING_FAILED" // メール送信失敗
  | "ADMIN_ALERT_FAILED" // 管理者アラート失敗
  | "GA4_TRACKING_FAILED" // GA4計測失敗
  | "UNKNOWN_ERROR"; // 不明なエラー

// エラー定義メタデータ
export interface ErrorDefinition {
  code: ErrorCode;
  httpStatus: number;
  message: string; // 開発者向けメッセージ (fallback)
  userMessage?: string; // ユーザー向けメッセージ
  typeUri: string; // RFC 7807 type URI
  severity: ErrorSeverity;
  retryable: boolean;
  category: ErrorCategory;
}

// エラー追加データ型
export interface ErrorContext extends Record<string, unknown> {
  userId?: string;
  eventId?: string;
  requestId?: string;
  path?: string;
  component?: string;
}
