/**
 * エラーページ用のアクションボタンコンポーネント
 */

"use client";

import { RefreshCw, Home, ArrowLeft, MessageCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { ErrorActionConfig } from "../types";

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
    // お問い合わせページにリダイレクト
    window.location.href = "/contact";
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
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
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
