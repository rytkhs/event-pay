/**
 * エラーページ用のアクションボタンコンポーネント
 */

"use client";

import Link from "next/link";

import type { LucideIcon } from "lucide-react";
import { RefreshCw, Home, ArrowLeft, MessageCircle, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ErrorActionConfig } from "../error-types";

interface ErrorActionsProps extends ErrorActionConfig {
  className?: string;
}

/**
 * エラーページのアクションボタン群
 */
export function ErrorActions({
  showRetry = false,
  showHome = true,
  showBack = false,
  showSupport = false,
  customActions = [],
  retryLabel = "再試行",
  onRetry,
  className = "",
}: ErrorActionsProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      // デフォルトの再試行アクション
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  const handleGoBack = () => {
    window.history.back();
  };

  const handleSupport = () => {
    // サポートページへのリンクまたはメールto:
    const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com";
    window.location.href = `mailto:${supportEmail}?subject=みんなの集金でエラーが発生しました`;
  };

  // アクションの優先順位を決定
  const actions = [];

  // カスタムアクション（最優先）
  customActions.forEach((action, index) => {
    actions.push(
      <Button
        key={`custom-${index}`}
        onClick={action.action}
        variant={action.variant || "default"}
        className="w-full"
      >
        {action.icon && <action.icon className="h-4 w-4 mr-2" />}
        {action.label}
      </Button>
    );
  });

  // 再試行ボタン
  if (showRetry) {
    actions.push(
      <Button
        key="retry"
        onClick={handleRetry}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        {retryLabel}
      </Button>
    );
  }

  // 戻るボタン
  if (showBack) {
    actions.push(
      <Button key="back" onClick={handleGoBack} variant="outline" className="w-full">
        <ArrowLeft className="h-4 w-4 mr-2" />
        戻る
      </Button>
    );
  }

  // サポートボタン
  if (showSupport) {
    actions.push(
      <Button key="support" onClick={handleSupport} variant="outline" className="w-full">
        <MessageCircle className="h-4 w-4 mr-2" />
        サポートに連絡
      </Button>
    );
  }

  // ホームボタン（最低優先）
  if (showHome) {
    const isOnlyAction = actions.length === 0;
    actions.push(
      <Button
        key="home"
        onClick={handleGoHome}
        variant={isOnlyAction ? "default" : "outline"}
        className="w-full"
      >
        <Home className="h-4 w-4 mr-2" />
        ホームに戻る
      </Button>
    );
  }

  if (actions.length === 0) {
    return null;
  }

  return <div className={`space-y-3 ${className}`}>{actions}</div>;
}

/**
 * 単一のアクションボタン
 */
interface SingleActionButtonProps {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive" | "secondary";
  icon?: LucideIcon;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function SingleActionButton({
  label,
  onClick,
  variant = "default",
  icon: Icon,
  className = "",
  disabled = false,
  loading = false,
}: SingleActionButtonProps) {
  return (
    <Button
      onClick={onClick}
      variant={variant}
      disabled={disabled || loading}
      className={`w-full ${className}`}
    >
      {loading ? (
        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
      ) : Icon ? (
        <Icon className="h-4 w-4 mr-2" />
      ) : null}
      {label}
    </Button>
  );
}

/**
 * リンクベースのアクションボタン
 */
interface LinkActionButtonProps {
  href: string;
  label: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
  icon?: LucideIcon;
  external?: boolean;
  className?: string;
}

export function LinkActionButton({
  href,
  label,
  variant = "default",
  icon: Icon,
  external = false,
  className = "",
}: LinkActionButtonProps) {
  if (external) {
    return (
      <Button asChild variant={variant} className={`w-full ${className}`}>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {Icon && <Icon className="h-4 w-4 mr-2" />}
          {label}
          <ExternalLink className="h-4 w-4 ml-2" />
        </a>
      </Button>
    );
  }

  return (
    <Button asChild variant={variant} className={`w-full ${className}`}>
      <Link href={href}>
        {Icon && <Icon className="h-4 w-4 mr-2" />}
        {label}
      </Link>
    </Button>
  );
}

/**
 * よく使われるアクションボタンのプリセット
 */
export const RetryButton = ({
  onRetry,
  label = "再試行",
}: {
  onRetry: () => void;
  label?: string;
}) => <SingleActionButton label={label} onClick={onRetry} icon={RefreshCw} variant="default" />;

export const HomeButton = ({ variant = "outline" }: { variant?: "default" | "outline" }) => (
  <LinkActionButton href="/" label="ホームに戻る" icon={Home} variant={variant} />
);

export const BackButton = ({ onClick }: { onClick?: () => void }) => {
  const handleBack = onClick || (() => window.history.back());

  return (
    <SingleActionButton label="戻る" onClick={handleBack} icon={ArrowLeft} variant="outline" />
  );
};
