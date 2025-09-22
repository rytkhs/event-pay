"use client";

import { usePathname } from "next/navigation";

import { cn } from "@core/utils";

import { FooterContent } from "./FooterContent";
import { footerConfig } from "./navigation-config";
import { GlobalFooterProps, FooterVariant } from "./types";

/**
 * グローバルフッターコンポーネント
 *
 * アプリケーション全体で共通のフッターを提供します。
 * パスと設定に基づいて適切なバリアントを自動選択します。
 */
export function GlobalFooter({
  variant,
  className,
  hideOnPages = [],
  customLinks: _customLinks = [],
}: GlobalFooterProps): JSX.Element | null {
  const pathname = usePathname();

  /**
   * パスに基づいてフッターバリアントを自動判定
   */
  const determineVariant = (): FooterVariant => {
    // 明示的にvariantが指定されている場合はそれを使用
    if (variant) return variant;

    // 非表示ページの場合は表示しない
    if (hideOnPages.some((page) => pathname.startsWith(page))) {
      return "minimal";
    }

    // 認証関連ページの判定
    if (
      pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/reset-password") ||
      pathname.startsWith("/verify-otp") ||
      pathname.startsWith("/confirm")
    ) {
      return "minimal";
    }

    // ゲスト関連ページの判定
    if (pathname.startsWith("/guest/") || pathname.startsWith("/invite/")) {
      return "compact";
    }

    // デフォルトは compact バリアント
    return "compact";
  };

  const currentVariant = determineVariant();
  const displaySettings = footerConfig.displaySettings[currentVariant];

  // minimalバリアントで何も表示しない場合
  if (currentVariant === "minimal" && !displaySettings.showCopyright) {
    return null;
  }

  const footerStyles = cn(
    "bg-background text-foreground",
    currentVariant === "minimal" ? "py-4" : "py-6",
    className
  );

  const containerStyles = cn("container mx-auto px-4 sm:px-6 lg:px-8", "max-w-7xl");

  return (
    <footer className={footerStyles} role="contentinfo" aria-label="サイトフッター">
      <div className={containerStyles}>
        {/* フッターコンテンツ */}
        {(displaySettings.showBranding ||
          displaySettings.showNavigation ||
          displaySettings.showCopyright) && <FooterContent variant={currentVariant} className="" />}
      </div>
    </footer>
  );
}
