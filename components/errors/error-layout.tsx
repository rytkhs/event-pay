/**
 * 統一されたエラーページレイアウトコンポーネント
 * Next.js App Router error.tsx, not-found.tsx, global-error.tsx 用
 */

"use client";

import { ReactNode } from "react";
import { ErrorCard } from "./ui/error-card";
import { ErrorPageProps } from "./error-types";
import { logError, addBreadcrumb } from "./error-logger";
import { useEffect } from "react";

interface ErrorLayoutProps extends ErrorPageProps {
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  showErrorDetails?: boolean;
  enableLogging?: boolean;
}

/**
 * 統一されたエラーページレイアウト
 */
export function ErrorLayout({
  code,
  category,
  severity = "medium",
  title,
  message,
  description,
  icon,
  showRetry = false,
  showHome = true,
  showBack = false,
  showSupport = false,
  customActions = [],
  retryLabel,
  onRetry,
  error,
  reset,
  size = "md",
  showErrorDetails = true,
  enableLogging = true,
  children,
  ...props
}: ErrorLayoutProps) {
  // エラーロギング
  useEffect(() => {
    if (enableLogging && error) {
      // パンくずリスト追加
      addBreadcrumb("error", `Error occurred: ${title}`, "error", { code, category, severity });

      // エラーログ記録
      logError(
        {
          code,
          category,
          severity,
          title,
          message,
          description,
          timestamp: new Date(),
        },
        error,
        {
          url: typeof window !== "undefined" ? window.location.href : undefined,
          pathname: typeof window !== "undefined" ? window.location.pathname : undefined,
          userAgent: typeof window !== "undefined" ? window.navigator.userAgent : undefined,
          referrer: typeof document !== "undefined" ? document.referrer : undefined,
        }
      );
    }
  }, [error, code, category, severity, title, message, description, enableLogging]);

  return (
    <ErrorCard
      code={code}
      category={category}
      severity={severity}
      title={title}
      message={message}
      description={description}
      icon={icon}
      showRetry={showRetry}
      showHome={showHome}
      showBack={showBack}
      showSupport={showSupport}
      customActions={customActions}
      retryLabel={retryLabel}
      onRetry={onRetry}
      error={showErrorDetails ? error : undefined}
      reset={reset}
      size={size}
      {...props}
    >
      {children}
    </ErrorCard>
  );
}

/**
 * 404エラー専用レイアウト
 */
export function NotFoundLayout({
  title = "ページが見つかりません",
  message = "お探しのページは存在しないか、移動された可能性があります。",
  description = "URLをご確認いただくか、ホームページに戻ってください。",
  showBack = true,
  ...props
}: Partial<ErrorLayoutProps>) {
  return (
    <ErrorLayout
      code="404"
      category="not-found"
      severity="low"
      title={title}
      message={message}
      description={description}
      showRetry={false}
      showHome={true}
      showBack={showBack}
      enableLogging={false} // 404は大量に発生する可能性があるためログ無効
      {...props}
    />
  );
}

/**
 * 500エラー専用レイアウト
 */
export function ServerErrorLayout({
  title = "サーバーエラーが発生しました",
  message = "申し訳ございません。サーバーで問題が発生しました。",
  description = "しばらく時間をおいて再度お試しください。問題が続く場合はサポートにお問い合わせください。",
  showRetry = true,
  showSupport = true,
  ...props
}: Partial<ErrorLayoutProps>) {
  return (
    <ErrorLayout
      code="500"
      category="server"
      severity="high"
      title={title}
      message={message}
      description={description}
      showRetry={showRetry}
      showHome={true}
      showSupport={showSupport}
      {...props}
    />
  );
}

/**
 * 認証エラー専用レイアウト
 */
export function AuthErrorLayout({
  title = "認証が必要です",
  message = "このページにアクセスするには認証が必要です。",
  description = "ログインしてから再度お試しください。",
  customActions,
  ...props
}: Partial<ErrorLayoutProps>) {
  const defaultCustomActions = customActions || [];

  return (
    <ErrorLayout
      code="401"
      category="auth"
      severity="medium"
      title={title}
      message={message}
      description={description}
      showRetry={false}
      showHome={true}
      customActions={defaultCustomActions}
      {...props}
    />
  );
}

/**
 * レート制限エラー専用レイアウト
 */
export function RateLimitErrorLayout({
  title = "アクセス制限",
  message = "アクセス頻度が高すぎます。",
  description = "セキュリティのため、短時間での連続アクセスを制限しています。5分程度お待ちください。",
  showRetry = true,
  retryLabel = "再試行",
  ...props
}: Partial<ErrorLayoutProps>) {
  return (
    <ErrorLayout
      code="429"
      category="security"
      severity="medium"
      title={title}
      message={message}
      description={description}
      showRetry={showRetry}
      showHome={true}
      retryLabel={retryLabel}
      {...props}
    >
      <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-700">{description}</p>
      </div>
    </ErrorLayout>
  );
}

/**
 * 決済エラー専用レイアウト
 */
export function PaymentErrorLayout({
  title = "決済エラーが発生しました",
  message = "決済処理中にエラーが発生しました。",
  description = "カード情報をご確認の上、再度お試しください。問題が続く場合はサポートにお問い合わせください。",
  showRetry = true,
  showSupport = true,
  ...props
}: Partial<ErrorLayoutProps>) {
  return (
    <ErrorLayout
      code="PAYMENT_FAILED"
      category="payment"
      severity="high"
      title={title}
      message={message}
      description={description}
      showRetry={showRetry}
      showHome={true}
      showSupport={showSupport}
      {...props}
    />
  );
}

/**
 * メンテナンス中専用レイアウト
 */
export function MaintenanceLayout({
  title = "メンテナンス中",
  message = "現在、システムメンテナンスを実施しています。",
  description = "ご迷惑をおかけして申し訳ございません。しばらくお待ちください。",
  showRetry = true,
  retryLabel = "再確認",
  ...props
}: Partial<ErrorLayoutProps>) {
  return (
    <ErrorLayout
      code="503"
      category="server"
      severity="medium"
      title={title}
      message={message}
      description={description}
      showRetry={showRetry}
      showHome={false}
      retryLabel={retryLabel}
      {...props}
    />
  );
}
