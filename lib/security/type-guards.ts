/**
 * セキュリティモジュール用型ガード関数
 * 型安全性を向上させるための型ガード関数を提供
 */

import type {
  TimeRange,
  SecuritySeverity,
  AdminReason,
  SuspiciousActivityType,
} from "@/types/security";
import type { Event } from "@/types/models";

// ====================================================================
// 基本型ガード
// ====================================================================

/**
 * 値がnullまたはundefinedでないことを確認
 */
export function isNotNullOrUndefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * 値が文字列であることを確認
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * 値が数値であることを確認
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value);
}

/**
 * 値がオブジェクトであることを確認（nullを除く）
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 値が配列であることを確認
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

// ====================================================================
// 日付・時間関連型ガード
// ====================================================================

/**
 * 値がDateオブジェクトであることを確認
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * 値が有効なISO日付文字列であることを確認
 */
export function isISODateString(value: unknown): value is string {
  if (!isString(value)) return false;
  const date = new Date(value);
  return isDate(date) && date.toISOString() === value;
}

/**
 * TimeRangeオブジェクトの型ガード
 */
export function isTimeRange(obj: unknown): obj is TimeRange {
  return (
    isObject(obj) &&
    "start" in obj &&
    "end" in obj &&
    isDate(obj.start) &&
    isDate(obj.end) &&
    obj.start <= obj.end
  );
}

/**
 * TimeRangeオブジェクトのアサーション
 */
export function assertTimeRange(obj: unknown): asserts obj is TimeRange {
  if (!isTimeRange(obj)) {
    throw new Error(
      "Invalid TimeRange object: must have start and end Date properties with start <= end"
    );
  }
}

// ====================================================================
// イベント関連型ガード
// ====================================================================

/**
 * 基本的なイベント情報の型ガード
 */
export interface EventInfo {
  id: string;
  status: string;
  date: string;
  registration_deadline?: string | null;
}

/**
 * イベント情報の型ガード
 */
export function isValidEventInfo(event: unknown): event is EventInfo {
  return (
    isObject(event) &&
    "id" in event &&
    "date" in event &&
    "status" in event &&
    isString(event.id) &&
    isString(event.date) &&
    isString(event.status) &&
    // registration_deadlineはオプショナル
    ("registration_deadline" in event
      ? event.registration_deadline === null || isString(event.registration_deadline)
      : true)
  );
}

/**
 * 完全なEventオブジェクトの型ガード
 */
export function isValidEvent(event: unknown): event is Event {
  if (!isObject(event)) return false;

  const requiredStringFields = [
    "id",
    "title",
    "date",
    "created_at",
    "updated_at",
    "created_by",
    "invite_token",
  ];
  const requiredNumberFields = ["fee"];

  // 必須文字列フィールドの確認
  for (const field of requiredStringFields) {
    if (!(field in event) || !isString(event[field])) {
      return false;
    }
  }

  // 必須数値フィールドの確認
  for (const field of requiredNumberFields) {
    if (!(field in event) || !isNumber(event[field])) {
      return false;
    }
  }

  // オプショナルフィールドの確認
  if ("description" in event && event.description !== null && !isString(event.description)) {
    return false;
  }

  if ("location" in event && event.location !== null && !isString(event.location)) {
    return false;
  }

  if ("capacity" in event && event.capacity !== null && !isNumber(event.capacity)) {
    return false;
  }

  if (
    "registration_deadline" in event &&
    event.registration_deadline !== null &&
    !isString(event.registration_deadline)
  ) {
    return false;
  }

  if (
    "payment_deadline" in event &&
    event.payment_deadline !== null &&
    !isString(event.payment_deadline)
  ) {
    return false;
  }

  // payment_methodsの確認
  if ("payment_methods" in event && !isArray(event.payment_methods)) {
    return false;
  }

  return true;
}

// ====================================================================
// セキュリティ関連型ガード
// ====================================================================

/**
 * SecuritySeverityの型ガード
 */
export function isSecuritySeverity(value: unknown): value is SecuritySeverity {
  return isString(value) && ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(value);
}

/**
 * AdminReasonの型ガード
 */
export function isAdminReason(value: unknown): value is AdminReason {
  return (
    isString(value) &&
    [
      "user_cleanup",
      "test_data_setup",
      "system_maintenance",
      "emergency_access",
      "data_migration",
      "security_investigation",
    ].includes(value)
  );
}

/**
 * SuspiciousActivityTypeの型ガード
 */
export function isSuspiciousActivityType(value: unknown): value is SuspiciousActivityType {
  return (
    isString(value) &&
    [
      "EMPTY_RESULT_SET",
      "ADMIN_ACCESS_ATTEMPT",
      "INVALID_TOKEN_PATTERN",
      "RATE_LIMIT_EXCEEDED",
      "UNAUTHORIZED_RLS_BYPASS",
      "BULK_DATA_ACCESS",
      "UNUSUAL_ACCESS_PATTERN",
    ].includes(value)
  );
}

// ====================================================================
// データベース関連型ガード
// ====================================================================

/**
 * データベースレコードの基本構造を確認
 */
export function isDatabaseRecord(
  value: unknown
): value is Record<string, unknown> & { id: string } {
  return isObject(value) && "id" in value && isString(value.id);
}

/**
 * 参加情報の型ガード
 */
export function isAttendanceRecord(value: unknown): value is {
  id: string;
  event_id: string;
  nickname: string;
  email: string;
  status: string;
  guest_token: string | null;
} {
  return (
    isDatabaseRecord(value) &&
    "event_id" in value &&
    isString(value.event_id) &&
    "nickname" in value &&
    isString(value.nickname) &&
    "email" in value &&
    isString(value.email) &&
    "status" in value &&
    isString(value.status) &&
    "guest_token" in value &&
    (value.guest_token === null || isString(value.guest_token))
  );
}

// ====================================================================
// 監査ログ関連型ガード
// ====================================================================

/**
 * 管理者アクセスログの型ガード
 */
export function isAdminAccessLog(value: unknown): value is {
  userId?: string;
  reason: AdminReason;
  context: string;
  operationDetails?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
} {
  return (
    isObject(value) &&
    "reason" in value &&
    isAdminReason(value.reason) &&
    "context" in value &&
    isString(value.context) &&
    (!("userId" in value) || value.userId === undefined || isString(value.userId)) &&
    (!("ipAddress" in value) || value.ipAddress === undefined || isString(value.ipAddress)) &&
    (!("userAgent" in value) || value.userAgent === undefined || isString(value.userAgent)) &&
    (!("operationDetails" in value) ||
      value.operationDetails === undefined ||
      isObject(value.operationDetails))
  );
}

/**
 * ゲストアクセスログの型ガード
 */
export function isGuestAccessLog(value: unknown): value is {
  guestTokenHash: string;
  action: string;
  success: boolean;
  attendanceId?: string;
  eventId?: string;
} {
  return (
    isObject(value) &&
    "guestTokenHash" in value &&
    isString(value.guestTokenHash) &&
    "action" in value &&
    isString(value.action) &&
    "success" in value &&
    typeof value.success === "boolean" &&
    (!("attendanceId" in value) ||
      value.attendanceId === undefined ||
      isString(value.attendanceId)) &&
    (!("eventId" in value) || value.eventId === undefined || isString(value.eventId))
  );
}

// ====================================================================
// エラーハンドリング関連型ガード
// ====================================================================

/**
 * Errorオブジェクトの型ガード
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * エラーコンテキストの型ガード
 */
export function isErrorContext(value: unknown): value is Record<string, unknown> {
  return isObject(value);
}

// ====================================================================
// ユーティリティ型ガード
// ====================================================================

/**
 * 値が空でないことを確認（null, undefined, 空文字列, 空配列, 空オブジェクトを除外）
 */
export function isNotEmpty<T>(value: T | null | undefined | "" | [] | object): value is T {
  if (value === null || value === undefined) return false;
  if (isString(value) && value === "") return false;
  if (isArray(value) && value.length === 0) return false;
  if (isObject(value) && Object.keys(value).length === 0) return false;
  return true;
}

/**
 * 値が有効なUUIDであることを確認
 */
export function isUUID(value: unknown): value is string {
  if (!isString(value)) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * 値が有効なメールアドレスであることを確認
 */
export function isEmail(value: unknown): value is string {
  if (!isString(value)) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * 複数の型ガードを組み合わせる
 */
export function combineTypeGuards<T, U>(
  guard1: (value: unknown) => value is T,
  guard2: (value: unknown) => value is U
): (value: unknown) => value is T & U {
  return (value: unknown): value is T & U => {
    return guard1(value) && guard2(value);
  };
}
