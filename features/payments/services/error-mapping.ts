import { PaymentErrorHandlingResult, PaymentErrorType } from "@core/types/payment-errors";

// PaymentErrorType -> ユーザー向けハンドリングの集約マップ（網羅必須）
export const ERROR_HANDLING_BY_TYPE: Record<PaymentErrorType, PaymentErrorHandlingResult> = {
  [PaymentErrorType.VALIDATION_ERROR]: {
    userMessage: "入力データが無効です。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.UNAUTHORIZED]: {
    userMessage: "認証が必要です。ログインしてから再度お試しください。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.FORBIDDEN]: {
    userMessage: "この操作を実行する権限がありません。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.INVALID_STATUS_TRANSITION]: {
    userMessage: "指定の状態に変更できません。操作内容をご確認ください。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.INVALID_PAYMENT_METHOD]: {
    userMessage: "入力内容に誤りがあります。確認して再度お試しください。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.INVALID_AMOUNT]: {
    userMessage: "金額が不正です。確認して再度お試しください。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.PAYMENT_ALREADY_EXISTS]: {
    userMessage: "この参加に対する決済は既に作成されています。",
    shouldRetry: false,
    logLevel: "info",
  },
  [PaymentErrorType.CONCURRENT_UPDATE]: {
    userMessage:
      "他のユーザーによって同時に更新されました。画面を更新して最新状態を確認してください。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.ATTENDANCE_NOT_FOUND]: {
    userMessage: "指定された参加記録が見つかりません。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.EVENT_NOT_FOUND]: {
    userMessage: "指定されたイベントが見つかりません。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.PAYMENT_NOT_FOUND]: {
    userMessage: "指定された決済レコードが見つかりません。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.INSUFFICIENT_FUNDS]: {
    userMessage: "決済が承認されませんでした。カード情報や残高をご確認ください。",
    shouldRetry: true,
    logLevel: "info",
  },
  [PaymentErrorType.CARD_DECLINED]: {
    userMessage: "カードが拒否されました。別のカードでお試しください。",
    shouldRetry: true,
    logLevel: "info",
  },
  [PaymentErrorType.STRIPE_API_ERROR]: {
    userMessage: "決済処理中にエラーが発生しました。しばらく待ってから再度お試しください。",
    shouldRetry: true,
    logLevel: "error",
  },
  [PaymentErrorType.DATABASE_ERROR]: {
    userMessage: "システムエラーが発生しました。管理者にお問い合わせください。",
    shouldRetry: false,
    logLevel: "error",
  },
  [PaymentErrorType.WEBHOOK_PROCESSING_ERROR]: {
    userMessage: "決済処理の確認中です。しばらくお待ちください。",
    shouldRetry: false,
    logLevel: "error",
  },
  [PaymentErrorType.CONNECT_ACCOUNT_NOT_FOUND]: {
    userMessage:
      "オンライン決済の準備ができていません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。",
    shouldRetry: false,
    logLevel: "error" as const,
  },
  [PaymentErrorType.CONNECT_ACCOUNT_RESTRICTED]: {
    userMessage:
      "現在オンライン決済がご利用いただけません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。",
    shouldRetry: false,
    logLevel: "error" as const,
  },
  [PaymentErrorType.STRIPE_CONFIG_ERROR]: {
    userMessage:
      "決済システムに一時的な問題が発生しています。しばらく時間をおいて再度お試しいただくか、現金決済をご利用ください。",
    shouldRetry: true,
    logLevel: "error",
  },
  [PaymentErrorType.NOT_FOUND]: {
    userMessage: "対象が見つかりません。",
    shouldRetry: false,
    logLevel: "warn",
  },
  [PaymentErrorType.RATE_LIMITED]: {
    userMessage: "リクエストが多すぎます。しばらく待ってから再度お試しください。",
    shouldRetry: true,
    logLevel: "warn",
  },
  [PaymentErrorType.UNKNOWN_ERROR]: {
    userMessage: "予期しないエラーが発生しました。",
    shouldRetry: false,
    logLevel: "error",
  },
};
