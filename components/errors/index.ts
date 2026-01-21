/**
 * EventPayエラーハンドリングシステム
 * 統一されたエラーページとエラーハンドリングコンポーネント
 */

// 型定義
export type * from "./error-types";

// コアコンポーネント
export { ErrorLayout } from "./ErrorLayout";
export {
  ErrorBoundary,
  ParticipationErrorBoundary,
  PaymentErrorBoundary,
  PageErrorBoundary,
  GlobalErrorBoundary,
} from "./ErrorBoundary";

// UIコンポーネント
export { ErrorCard, InlineErrorCard, NotificationErrorCard } from "./ui/ErrorCard";
export { ErrorIcon, getErrorIcon, getErrorColor } from "./ui/ErrorIcon";
export {
  ErrorActions,
  SingleActionButton,
  LinkActionButton,
  RetryButton,
  HomeButton,
  BackButton,
} from "./ui/ErrorActions";

// 専用レイアウト
export {
  NotFoundLayout,
  ServerErrorLayout,
  AuthErrorLayout,
  RateLimitErrorLayout,
  PaymentErrorLayout,
  MaintenanceLayout,
} from "./ErrorLayout";

// エラーロガー
export {
  ErrorLogger,
  errorLogger,
  logError,
  addBreadcrumb,
  getLocalLogs,
  clearLocalLogs,
} from "./error-logger";

// プリセットアイコン
export {
  NetworkErrorIcon,
  AuthErrorIcon,
  ServerErrorIcon,
  NotFoundIcon,
  PaymentErrorIcon,
  SecurityErrorIcon,
  BusinessErrorIcon,
} from "./ui/ErrorIcon";
