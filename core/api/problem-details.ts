/**
 * RFC 7807 "Problem Details for HTTP APIs" 準拠のエラーハンドリング
 *
 * @see https://tools.ietf.org/rfc/rfc7807.txt
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 */

import { NextResponse } from "next/server";
import { logger } from "@core/logging/app-logger";
import { randomBytes } from "crypto";

/**
 * RFC 7807 Problem Details の基本構造
 */
export interface ProblemDetails {
  /** 問題タイプの一意識別子（URI）- 機械可読 */
  type: string;
  /** 問題の短い、人間可読な要約 */
  title: string;
  /** HTTPステータスコード */
  status: number;
  /** 問題の詳細な説明（この特定のインスタンス向け） */
  detail: string;
  /** 問題が発生したリソースの識別子（URI） */
  instance: string;

  // EventPay 拡張フィールド
  /** 機械可読なエラーコード（内部処理用） */
  code: string;
  /** リクエスト追跡ID */
  correlation_id: string;
  /** リトライ可能かどうか */
  retryable: boolean;
  /** バリデーションエラーの詳細（該当する場合） */
  errors?: ValidationError[];
  /** 参考ドキュメントURL（該当する場合） */
  docs_url?: string;
}

/**
 * バリデーションエラーの詳細
 */
export interface ValidationError {
  /** エラーが発生したフィールド・パラメータのポインタ */
  pointer: string;
  /** バリデーションエラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
}

/**
 * エラー作成時の設定オプション
 */
interface ProblemOptions {
  /** HTTPステータスコード（デフォルト: 500） */
  status?: number;
  /** 詳細メッセージ */
  detail?: string;
  /** リクエストパス（デフォルト: 自動取得） */
  instance?: string;
  /** リトライ可能性（デフォルト: false） */
  retryable?: boolean;
  /** バリデーションエラー詳細 */
  errors?: ValidationError[];
  /** 参考ドキュメントURL */
  docs_url?: string;
  /** カスタム相関ID（デフォルト: 自動生成） */
  correlation_id?: string;
  /** ログに出力するための追加コンテキスト */
  log_context?: Record<string, unknown>;
}

/**
 * 相関IDを生成
 */
function generateCorrelationId(): string {
  return `req_${randomBytes(8).toString("hex")}`;
}

/**
 * RFC 7807 準拠の Problem Details オブジェクトを作成
 */
function createProblem(code: string, options: ProblemOptions = {}): ProblemDetails {
  const errorDef = ERROR_DEFINITIONS[code];
  if (!errorDef) {
    throw new Error(`Unknown error code: ${code}`);
  }

  const correlationId = options.correlation_id || generateCorrelationId();
  const status = options.status || errorDef.defaultStatus;
  const detail = options.detail || errorDef.defaultDetail;

  const problem: ProblemDetails = {
    type: errorDef.type,
    title: errorDef.title,
    status,
    detail,
    instance: options.instance || "/api/unknown",
    code,
    correlation_id: correlationId,
    retryable: options.retryable ?? errorDef.retryable,
  };

  if (options.errors) {
    problem.errors = options.errors;
  }

  if (options.docs_url) {
    problem.docs_url = options.docs_url;
  }

  // ログ出力（PII除外済みの想定）
  logger.error(`API Error: ${code}`, {
    tag: "api-error",
    correlation_id: correlationId,
    error_code: code,
    status,
    instance: problem.instance,
    retryable: problem.retryable,
    ...options.log_context,
  });

  return problem;
}

/**
 * Problem Details を含む NextResponse を作成
 */
export function createProblemResponse(
  code: string,
  options: ProblemOptions = {}
): NextResponse<ProblemDetails> {
  const problem = createProblem(code, options);

  const response = NextResponse.json(problem, {
    status: problem.status,
    headers: {
      "Content-Type": "application/problem+json",
      "X-Correlation-ID": problem.correlation_id,
    },
  });

  // レート制限の場合は Retry-After ヘッダーを追加
  if (problem.status === 429) {
    response.headers.set("Retry-After", "60"); // デフォルト60秒
  }

  // 認証エラーの場合は WWW-Authenticate ヘッダーを追加
  if (problem.status === 401) {
    response.headers.set("WWW-Authenticate", "Bearer");
  }

  return response;
}

/**
 * エラー定義マッピング
 */
interface ErrorDefinition {
  type: string;
  title: string;
  defaultStatus: number;
  defaultDetail: string;
  retryable: boolean;
}

const ERROR_DEFINITIONS: Record<string, ErrorDefinition> = {
  // 認証・認可エラー
  UNAUTHORIZED: {
    type: "https://api.eventpay.app/errors/unauthorized",
    title: "Unauthorized",
    defaultStatus: 401,
    defaultDetail: "認証が必要です",
    retryable: false,
  },
  FORBIDDEN: {
    type: "https://api.eventpay.app/errors/forbidden",
    title: "Forbidden",
    defaultStatus: 403,
    defaultDetail: "このリソースにアクセスする権限がありません",
    retryable: false,
  },
  TOKEN_INVALID: {
    type: "https://api.eventpay.app/errors/token_invalid",
    title: "Invalid Token",
    defaultStatus: 401,
    defaultDetail: "提供されたトークンが無効です",
    retryable: false,
  },

  // リクエストエラー
  INVALID_REQUEST: {
    type: "https://api.eventpay.app/errors/invalid_request",
    title: "Invalid Request",
    defaultStatus: 400,
    defaultDetail: "リクエストが無効です",
    retryable: false,
  },
  VALIDATION_ERROR: {
    type: "https://api.eventpay.app/errors/validation_error",
    title: "Validation Error",
    defaultStatus: 422,
    defaultDetail: "入力値の検証に失敗しました",
    retryable: false,
  },
  MISSING_PARAMETER: {
    type: "https://api.eventpay.app/errors/missing_parameter",
    title: "Missing Parameter",
    defaultStatus: 400,
    defaultDetail: "必須パラメータが不足しています",
    retryable: false,
  },

  // リソースエラー
  NOT_FOUND: {
    type: "https://api.eventpay.app/errors/not_found",
    title: "Not Found",
    defaultStatus: 404,
    defaultDetail: "指定されたリソースが見つかりません",
    retryable: false,
  },
  RESOURCE_CONFLICT: {
    type: "https://api.eventpay.app/errors/resource_conflict",
    title: "Resource Conflict",
    defaultStatus: 409,
    defaultDetail: "リソースの競合が発生しました",
    retryable: true,
  },

  // レート制限
  RATE_LIMITED: {
    type: "https://api.eventpay.app/errors/rate_limited",
    title: "Rate Limit Exceeded",
    defaultStatus: 429,
    defaultDetail: "リクエスト回数の上限に達しました。しばらく待ってから再試行してください",
    retryable: true,
  },

  // 決済関連
  PAYMENT_SESSION_NOT_FOUND: {
    type: "https://api.eventpay.app/errors/payment_session_not_found",
    title: "Payment Session Not Found",
    defaultStatus: 404,
    defaultDetail: "決済セッションが見つかりません",
    retryable: false,
  },
  PAYMENT_SESSION_OUTDATED: {
    type: "https://api.eventpay.app/errors/payment_session_outdated",
    title: "Payment Session Outdated",
    defaultStatus: 409,
    defaultDetail: "最新の決済セッションではありません。再度お試しください",
    retryable: false,
  },
  PAYMENT_PROCESSING_ERROR: {
    type: "https://api.eventpay.app/errors/payment_processing_error",
    title: "Payment Processing Error",
    defaultStatus: 422,
    defaultDetail: "決済処理中にエラーが発生しました",
    retryable: true,
  },

  // ゲスト関連
  GUEST_TOKEN_NOT_FOUND: {
    type: "https://api.eventpay.app/errors/guest_token_not_found",
    title: "Guest Token Not Found",
    defaultStatus: 404,
    defaultDetail: "ゲストトークンが見つかりません",
    retryable: false,
  },
  GUEST_TOKEN_INVALID: {
    type: "https://api.eventpay.app/errors/guest_token_invalid",
    title: "Invalid Guest Token",
    defaultStatus: 401,
    defaultDetail: "無効なゲストトークンです",
    retryable: false,
  },

  // 招待関連
  INVITE_TOKEN_NOT_FOUND: {
    type: "https://api.eventpay.app/errors/invite_token_not_found",
    title: "Invite Token Not Found",
    defaultStatus: 404,
    defaultDetail: "招待リンクが見つかりません",
    retryable: false,
  },
  INVITE_TOKEN_INVALID: {
    type: "https://api.eventpay.app/errors/invite_token_invalid",
    title: "Invalid Invite Token",
    defaultStatus: 404,
    defaultDetail: "無効な招待リンクです",
    retryable: false,
  },
  EVENT_CANCELLED: {
    type: "https://api.eventpay.app/errors/event_cancelled",
    title: "Event Cancelled",
    defaultStatus: 410,
    defaultDetail: "このイベントはキャンセルされました",
    retryable: false,
  },
  EVENT_ENDED: {
    type: "https://api.eventpay.app/errors/event_ended",
    title: "Event Ended",
    defaultStatus: 410,
    defaultDetail: "このイベントは終了しています",
    retryable: false,
  },
  REGISTRATION_DEADLINE_PASSED: {
    type: "https://api.eventpay.app/errors/registration_deadline_passed",
    title: "Registration Deadline Passed",
    defaultStatus: 410,
    defaultDetail: "参加申込期限が過ぎています",
    retryable: false,
  },

  // 参加管理関連
  ATTENDANCE_CAPACITY_REACHED: {
    type: "https://api.eventpay.app/errors/attendance_capacity_reached",
    title: "Attendance Capacity Reached",
    defaultStatus: 409,
    defaultDetail: "イベントの定員に達しているため参加できません",
    retryable: false,
  },
  ATTENDANCE_DEADLINE_PASSED: {
    type: "https://api.eventpay.app/errors/attendance_deadline_passed",
    title: "Attendance Deadline Passed",
    defaultStatus: 410,
    defaultDetail: "申込締切を過ぎているため参加状況を変更できません",
    retryable: false,
  },
  ATTENDANCE_NOT_FOUND: {
    type: "https://api.eventpay.app/errors/attendance_not_found",
    title: "Attendance Not Found",
    defaultStatus: 404,
    defaultDetail: "参加データが見つかりませんでした",
    retryable: false,
  },
  ATTENDANCE_STATUS_ROLLBACK_REJECTED: {
    type: "https://api.eventpay.app/errors/attendance_status_rollback_rejected",
    title: "Attendance Status Rollback Rejected",
    defaultStatus: 400,
    defaultDetail: "参加状況を過去の状態に戻すことはできません",
    retryable: false,
  },

  // イベント管理関連
  EVENT_NOT_FOUND: {
    type: "https://api.eventpay.app/errors/event_not_found",
    title: "Event Not Found",
    defaultStatus: 404,
    defaultDetail: "指定されたイベントが見つかりません",
    retryable: false,
  },
  EVENT_ACCESS_DENIED: {
    type: "https://api.eventpay.app/errors/event_access_denied",
    title: "Event Access Denied",
    defaultStatus: 403,
    defaultDetail: "このイベントへのアクセス権限がありません",
    retryable: false,
  },
  EVENT_DELETE_RESTRICTED: {
    type: "https://api.eventpay.app/errors/event_delete_restricted",
    title: "Event Delete Restricted",
    defaultStatus: 409,
    defaultDetail: "参加者が存在するためイベントを削除できません",
    retryable: false,
  },
  EVENT_DELETE_FAILED: {
    type: "https://api.eventpay.app/errors/event_delete_failed",
    title: "Event Delete Failed",
    defaultStatus: 500,
    defaultDetail: "イベントの削除に失敗しました",
    retryable: true,
  },
  EVENT_INVALID_ID: {
    type: "https://api.eventpay.app/errors/event_invalid_id",
    title: "Invalid Event ID",
    defaultStatus: 400,
    defaultDetail: "無効なイベントID形式です",
    retryable: false,
  },

  // サーバーエラー
  INTERNAL_ERROR: {
    type: "https://api.eventpay.app/errors/internal_error",
    title: "Internal Server Error",
    defaultStatus: 500,
    defaultDetail: "内部サーバーエラーが発生しました",
    retryable: true,
  },
  DATABASE_ERROR: {
    type: "https://api.eventpay.app/errors/database_error",
    title: "Database Error",
    defaultStatus: 500,
    defaultDetail: "データベースエラーが発生しました",
    retryable: true,
  },
  EXTERNAL_SERVICE_ERROR: {
    type: "https://api.eventpay.app/errors/external_service_error",
    title: "External Service Error",
    defaultStatus: 502,
    defaultDetail: "外部サービスとの通信でエラーが発生しました",
    retryable: true,
  },
} as const;

/**
 * エラーコードの型安全性のための型定義
 */
export type ErrorCode = keyof typeof ERROR_DEFINITIONS;

/**
 * クエリパラメータのバリデーションエラー作成ヘルパー
 */
export function createQueryValidationError(
  param: string,
  code: string,
  message: string
): ValidationError {
  return {
    pointer: `/query/${param}`,
    code,
    message,
  };
}
