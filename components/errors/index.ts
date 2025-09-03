/**
 * EventPayエラーハンドリングシステム
 * 統一されたエラーページとエラーハンドリングコンポーネント
 */

// 型定義
export type * from "./error-types";

// コアコンポーネント
export { ErrorLayout } from "./error-layout";
export {
  ErrorBoundary,
  ParticipationErrorBoundary,
  PaymentErrorBoundary,
  PageErrorBoundary,
  GlobalErrorBoundary,
} from "./error-boundary";

// UIコンポーネント
export { ErrorCard, InlineErrorCard, NotificationErrorCard } from "./ui/error-card";
export { ErrorIcon, getErrorIcon, getErrorColor } from "./ui/error-icon";
export {
  ErrorActions,
  SingleActionButton,
  LinkActionButton,
  RetryButton,
  HomeButton,
  BackButton,
} from "./ui/error-actions";

// 専用レイアウト
export {
  NotFoundLayout,
  ServerErrorLayout,
  AuthErrorLayout,
  RateLimitErrorLayout,
  PaymentErrorLayout,
  MaintenanceLayout,
} from "./error-layout";

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
} from "./ui/error-icon";
