/**
 * API統一エラーコード定義
 * 全APIで一貫したエラーハンドリングを提供
 */

export const ERROR_CODES = {
  // 認証関連エラー
  AUTH: {
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    EMAIL_NOT_CONFIRMED: 'EMAIL_NOT_CONFIRMED',
    NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    SESSION_EXPIRED: 'SESSION_EXPIRED',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    LOGIN_FAILED: 'LOGIN_FAILED',
    LOGOUT_FAILED: 'LOGOUT_FAILED',
    REGISTRATION_FAILED: 'REGISTRATION_FAILED',
    PASSWORD_RESET_FAILED: 'PASSWORD_RESET_FAILED',
    PASSWORD_UPDATE_FAILED: 'PASSWORD_UPDATE_FAILED',
  },

  // 入力検証エラー
  VALIDATION: {
    INVALID_EMAIL: 'INVALID_EMAIL',
    WEAK_PASSWORD: 'WEAK_PASSWORD',
    MISSING_FIELDS: 'MISSING_FIELDS',
    INVALID_FORMAT: 'INVALID_FORMAT',
    INVALID_REQUEST: 'INVALID_REQUEST',
    INVALID_JSON: 'INVALID_JSON',
    FIELD_TOO_LONG: 'FIELD_TOO_LONG',
    FIELD_TOO_SHORT: 'FIELD_TOO_SHORT',
    INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
    INVALID_DATE: 'INVALID_DATE',
  },

  // セキュリティ関連エラー
  SECURITY: {
    CSRF_TOKEN_INVALID: 'CSRF_TOKEN_INVALID',
    CSRF_TOKEN_MISSING: 'CSRF_TOKEN_MISSING',
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
    SUSPICIOUS_ACTIVITY: 'SUSPICIOUS_ACTIVITY',
    IP_BLOCKED: 'IP_BLOCKED',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    INVALID_TOKEN: 'INVALID_TOKEN',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
  },

  // サーバーエラー
  SERVER: {
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    TIMEOUT: 'TIMEOUT',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  },

  // ビジネスロジックエラー
  BUSINESS: {
    RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
    RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
    OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
    INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
    EVENT_FULL: 'EVENT_FULL',
    EVENT_CLOSED: 'EVENT_CLOSED',
    PAYMENT_FAILED: 'PAYMENT_FAILED',
    ALREADY_REGISTERED: 'ALREADY_REGISTERED',
  },
} as const;

// エラーメッセージの多言語対応
export const ERROR_MESSAGES = {
  ja: {
    // 認証関連
    [ERROR_CODES.AUTH.INVALID_CREDENTIALS]: 'メールアドレスまたはパスワードが正しくありません',
    [ERROR_CODES.AUTH.EMAIL_NOT_CONFIRMED]: 'メールアドレスの確認が完了していません。確認メールをご確認ください。',
    [ERROR_CODES.AUTH.NOT_AUTHENTICATED]: '認証が必要です',
    [ERROR_CODES.AUTH.UNAUTHORIZED]: 'この操作を実行する権限がありません',
    [ERROR_CODES.AUTH.SESSION_EXPIRED]: 'セッションの有効期限が切れました。再度ログインしてください。',
    [ERROR_CODES.AUTH.ACCOUNT_LOCKED]: 'アカウントが一時的にロックされています',
    [ERROR_CODES.AUTH.LOGIN_FAILED]: 'ログインに失敗しました',
    [ERROR_CODES.AUTH.LOGOUT_FAILED]: 'ログアウトに失敗しました。再試行してください。',
    [ERROR_CODES.AUTH.REGISTRATION_FAILED]: 'ユーザー登録に失敗しました',
    [ERROR_CODES.AUTH.PASSWORD_RESET_FAILED]: 'パスワードリセットに失敗しました',
    [ERROR_CODES.AUTH.PASSWORD_UPDATE_FAILED]: 'パスワード更新に失敗しました',

    // 入力検証
    [ERROR_CODES.VALIDATION.INVALID_EMAIL]: '有効なメールアドレスを入力してください',
    [ERROR_CODES.VALIDATION.WEAK_PASSWORD]: 'パスワードは8文字以上で英数字を含める必要があります',
    [ERROR_CODES.VALIDATION.MISSING_FIELDS]: '必須項目を入力してください',
    [ERROR_CODES.VALIDATION.INVALID_FORMAT]: '入力形式が正しくありません',
    [ERROR_CODES.VALIDATION.INVALID_REQUEST]: '無効なリクエストです',
    [ERROR_CODES.VALIDATION.INVALID_JSON]: '有効なJSONを送信してください',
    [ERROR_CODES.VALIDATION.FIELD_TOO_LONG]: '入力値が長すぎます',
    [ERROR_CODES.VALIDATION.FIELD_TOO_SHORT]: '入力値が短すぎます',
    [ERROR_CODES.VALIDATION.INVALID_PHONE_NUMBER]: '有効な電話番号を入力してください',
    [ERROR_CODES.VALIDATION.INVALID_DATE]: '有効な日付を入力してください',

    // セキュリティ
    [ERROR_CODES.SECURITY.CSRF_TOKEN_INVALID]: 'セキュリティトークンが無効です',
    [ERROR_CODES.SECURITY.CSRF_TOKEN_MISSING]: 'セキュリティトークンが必要です',
    [ERROR_CODES.SECURITY.RATE_LIMIT_EXCEEDED]: 'レート制限に達しました。しばらく待ってから再試行してください。',
    [ERROR_CODES.SECURITY.SUSPICIOUS_ACTIVITY]: '不審な活動が検出されました',
    [ERROR_CODES.SECURITY.IP_BLOCKED]: 'このIPアドレスからのアクセスはブロックされています',
    [ERROR_CODES.SECURITY.TOKEN_EXPIRED]: 'トークンの有効期限が切れました',
    [ERROR_CODES.SECURITY.INVALID_TOKEN]: '無効なトークンです',
    [ERROR_CODES.SECURITY.PERMISSION_DENIED]: 'アクセス権限がありません',

    // サーバーエラー
    [ERROR_CODES.SERVER.INTERNAL_ERROR]: 'サーバーエラーが発生しました',
    [ERROR_CODES.SERVER.DATABASE_ERROR]: 'データベースエラーが発生しました',
    [ERROR_CODES.SERVER.SERVICE_UNAVAILABLE]: 'サービスが一時的に利用できません',
    [ERROR_CODES.SERVER.TIMEOUT]: 'リクエストがタイムアウトしました',
    [ERROR_CODES.SERVER.CONNECTION_FAILED]: 'サービスに接続できません',
    [ERROR_CODES.SERVER.EXTERNAL_SERVICE_ERROR]: '外部サービスでエラーが発生しました',

    // ビジネスロジック
    [ERROR_CODES.BUSINESS.RESOURCE_NOT_FOUND]: 'リソースが見つかりません',
    [ERROR_CODES.BUSINESS.RESOURCE_ALREADY_EXISTS]: 'リソースが既に存在します',
    [ERROR_CODES.BUSINESS.OPERATION_NOT_ALLOWED]: 'この操作は許可されていません',
    [ERROR_CODES.BUSINESS.INSUFFICIENT_FUNDS]: '残高が不足しています',
    [ERROR_CODES.BUSINESS.EVENT_FULL]: 'イベントは満席です',
    [ERROR_CODES.BUSINESS.EVENT_CLOSED]: 'イベントの受付は終了しました',
    [ERROR_CODES.BUSINESS.PAYMENT_FAILED]: '決済に失敗しました',
    [ERROR_CODES.BUSINESS.ALREADY_REGISTERED]: '既に登録済みです',
  },

  en: {
    // 認証関連
    [ERROR_CODES.AUTH.INVALID_CREDENTIALS]: 'Invalid email or password',
    [ERROR_CODES.AUTH.EMAIL_NOT_CONFIRMED]: 'Email address not confirmed. Please check your confirmation email.',
    [ERROR_CODES.AUTH.NOT_AUTHENTICATED]: 'Authentication required',
    [ERROR_CODES.AUTH.UNAUTHORIZED]: 'You do not have permission to perform this operation',
    [ERROR_CODES.AUTH.SESSION_EXPIRED]: 'Session expired. Please log in again.',
    [ERROR_CODES.AUTH.ACCOUNT_LOCKED]: 'Account temporarily locked',
    [ERROR_CODES.AUTH.LOGIN_FAILED]: 'Login failed',
    [ERROR_CODES.AUTH.LOGOUT_FAILED]: 'Logout failed. Please try again.',
    [ERROR_CODES.AUTH.REGISTRATION_FAILED]: 'User registration failed',
    [ERROR_CODES.AUTH.PASSWORD_RESET_FAILED]: 'Password reset failed',
    [ERROR_CODES.AUTH.PASSWORD_UPDATE_FAILED]: 'Password update failed',

    // 入力検証
    [ERROR_CODES.VALIDATION.INVALID_EMAIL]: 'Please enter a valid email address',
    [ERROR_CODES.VALIDATION.WEAK_PASSWORD]: 'Password must be at least 8 characters and contain letters and numbers',
    [ERROR_CODES.VALIDATION.MISSING_FIELDS]: 'Please fill in all required fields',
    [ERROR_CODES.VALIDATION.INVALID_FORMAT]: 'Invalid input format',
    [ERROR_CODES.VALIDATION.INVALID_REQUEST]: 'Invalid request',
    [ERROR_CODES.VALIDATION.INVALID_JSON]: 'Please send valid JSON',
    [ERROR_CODES.VALIDATION.FIELD_TOO_LONG]: 'Input value is too long',
    [ERROR_CODES.VALIDATION.FIELD_TOO_SHORT]: 'Input value is too short',
    [ERROR_CODES.VALIDATION.INVALID_PHONE_NUMBER]: 'Please enter a valid phone number',
    [ERROR_CODES.VALIDATION.INVALID_DATE]: 'Please enter a valid date',

    // セキュリティ
    [ERROR_CODES.SECURITY.CSRF_TOKEN_INVALID]: 'Invalid security token',
    [ERROR_CODES.SECURITY.CSRF_TOKEN_MISSING]: 'Security token required',
    [ERROR_CODES.SECURITY.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded. Please wait and try again.',
    [ERROR_CODES.SECURITY.SUSPICIOUS_ACTIVITY]: 'Suspicious activity detected',
    [ERROR_CODES.SECURITY.IP_BLOCKED]: 'Access from this IP address is blocked',
    [ERROR_CODES.SECURITY.TOKEN_EXPIRED]: 'Token expired',
    [ERROR_CODES.SECURITY.INVALID_TOKEN]: 'Invalid token',
    [ERROR_CODES.SECURITY.PERMISSION_DENIED]: 'Access denied',

    // サーバーエラー
    [ERROR_CODES.SERVER.INTERNAL_ERROR]: 'Internal server error',
    [ERROR_CODES.SERVER.DATABASE_ERROR]: 'Database error occurred',
    [ERROR_CODES.SERVER.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
    [ERROR_CODES.SERVER.TIMEOUT]: 'Request timeout',
    [ERROR_CODES.SERVER.CONNECTION_FAILED]: 'Unable to connect to service',
    [ERROR_CODES.SERVER.EXTERNAL_SERVICE_ERROR]: 'External service error',

    // ビジネスロジック
    [ERROR_CODES.BUSINESS.RESOURCE_NOT_FOUND]: 'Resource not found',
    [ERROR_CODES.BUSINESS.RESOURCE_ALREADY_EXISTS]: 'Resource already exists',
    [ERROR_CODES.BUSINESS.OPERATION_NOT_ALLOWED]: 'Operation not allowed',
    [ERROR_CODES.BUSINESS.INSUFFICIENT_FUNDS]: 'Insufficient funds',
    [ERROR_CODES.BUSINESS.EVENT_FULL]: 'Event is full',
    [ERROR_CODES.BUSINESS.EVENT_CLOSED]: 'Event registration closed',
    [ERROR_CODES.BUSINESS.PAYMENT_FAILED]: 'Payment failed',
    [ERROR_CODES.BUSINESS.ALREADY_REGISTERED]: 'Already registered',
  },
} as const;

// エラーレスポンス構造の型定義
export interface APIErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp?: string;
    requestId?: string;
  };
}

export interface APISuccessResponse<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type APIResponse<T = any> = APIErrorResponse | APISuccessResponse<T>;

// エラーレスポンスの作成ヘルパー関数
export function createErrorResponse(
  code: string,
  customMessage?: string,
  details?: any,
  locale: 'ja' | 'en' = 'ja'
): APIErrorResponse {
  const message = customMessage || ERROR_MESSAGES[locale][code as keyof typeof ERROR_MESSAGES[typeof locale]] || 'Unknown error';
  
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    },
  };
}

// 成功レスポンスの作成ヘルパー関数
export function createSuccessResponse<T>(
  data: T,
  message?: string
): APISuccessResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
  };
}

// エラーコードからHTTPステータスコードを決定
export function getHTTPStatusFromErrorCode(code: string): number {
  // 認証エラー
  if (code.startsWith('AUTH_') || code === ERROR_CODES.AUTH.INVALID_CREDENTIALS) {
    if (code === ERROR_CODES.AUTH.NOT_AUTHENTICATED || code === ERROR_CODES.AUTH.SESSION_EXPIRED) {
      return 401; // Unauthorized
    }
    if (code === ERROR_CODES.AUTH.UNAUTHORIZED || code === ERROR_CODES.SECURITY.PERMISSION_DENIED) {
      return 403; // Forbidden
    }
    return 401; // その他の認証エラー
  }

  // バリデーションエラー
  if (Object.values(ERROR_CODES.VALIDATION).includes(code as any)) {
    return 400; // Bad Request
  }

  // セキュリティエラー
  if (Object.values(ERROR_CODES.SECURITY).includes(code as any)) {
    if (code === ERROR_CODES.SECURITY.RATE_LIMIT_EXCEEDED) {
      return 429; // Too Many Requests
    }
    if (code === ERROR_CODES.SECURITY.CSRF_TOKEN_INVALID || code === ERROR_CODES.SECURITY.CSRF_TOKEN_MISSING) {
      return 403; // Forbidden
    }
    return 403; // その他のセキュリティエラー
  }

  // ビジネスロジックエラー
  if (Object.values(ERROR_CODES.BUSINESS).includes(code as any)) {
    if (code === ERROR_CODES.BUSINESS.RESOURCE_NOT_FOUND) {
      return 404; // Not Found
    }
    if (code === ERROR_CODES.BUSINESS.RESOURCE_ALREADY_EXISTS) {
      return 409; // Conflict
    }
    return 400; // その他のビジネスロジックエラー
  }

  // サーバーエラー
  if (Object.values(ERROR_CODES.SERVER).includes(code as any)) {
    if (code === ERROR_CODES.SERVER.SERVICE_UNAVAILABLE) {
      return 503; // Service Unavailable
    }
    if (code === ERROR_CODES.SERVER.TIMEOUT) {
      return 504; // Gateway Timeout
    }
    return 500; // Internal Server Error
  }

  // デフォルト
  return 500;
}

// 使用例のためのヘルパー関数
export function createValidationError(field: string, locale: 'ja' | 'en' = 'ja') {
  let code: string;
  
  switch (field) {
    case 'email':
      code = ERROR_CODES.VALIDATION.INVALID_EMAIL;
      break;
    case 'password':
      code = ERROR_CODES.VALIDATION.WEAK_PASSWORD;
      break;
    default:
      code = ERROR_CODES.VALIDATION.INVALID_FORMAT;
  }
  
  return createErrorResponse(code, undefined, { field }, locale);
}