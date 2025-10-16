"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppHeader } from "./AppHeader";
import { GuestHeader } from "./GuestHeader";
import { MarketingHeader } from "./MarketingHeader";
import { GlobalHeaderProps, HeaderVariant } from "./types";

/**
 * グローバルヘッダーコンポーネント
 *
 * 認証状態とパスに基づいて適切なヘッダーを自動選択して表示します。
 *
 * @param user - 認証ユーザー情報
 * @param variant - ヘッダーの種類（自動判定の場合は省略可）
 * @param hideOnScroll - スクロール時の非表示制御
 * @param className - カスタムクラス名
 */
export function GlobalHeader({
  user,
  variant,
  hideOnScroll: _hideOnScroll = false,
  className,
}: GlobalHeaderProps) {
  const pathname = usePathname();

  /**
   * パスと認証状態に基づいてヘッダーバリアントを自動判定
   */
  const determineVariant = (): HeaderVariant => {
    // 明示的にvariantが指定されている場合はそれを使用
    if (variant) return variant;

    // ゲスト関連ページの判定（招待・ゲストページ共通）
    if (pathname.startsWith("/guest/") || pathname.startsWith("/invite/")) {
      return "guest";
    }

    // 認証関連ページの判定
    if (
      pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/reset-password") ||
      pathname.startsWith("/verify-otp")
    ) {
      return "minimal";
    }

    // 認証済みユーザー向けページの判定
    if (user) {
      // プロテクトされたページかチェック
      const protectedPaths = ["/dashboard", "/events", "/settings", "/profile"];

      if (protectedPaths.some((path) => pathname.startsWith(path))) {
        return "app";
      }
    }

    // デフォルト（未認証のランディングページなど）
    return "marketing";
  };

  const currentVariant = determineVariant();

  // 最小限のヘッダー（認証ページなど）
  if (currentVariant === "minimal") {
    return (
      <header className="bg-background border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center h-16">
            <Link
              href="/"
              className="text-xl sm:text-2xl font-bold text-primary hover:opacity-80 transition-opacity"
            >
              みんなの集金
            </Link>
          </div>
        </div>
      </header>
    );
  }

  // ゲストヘッダー（招待・ゲストページ共通）
  if (currentVariant === "guest") {
    // 招待ページやゲストページでは参加状況は表示しない（各ページのコンテンツで処理）
    return <GuestHeader attendance={undefined} className={className} />;
  }

  // アプリケーションヘッダー（認証済みユーザー）
  if (currentVariant === "app" && user) {
    return <AppHeader user={user} className={className} />;
  }

  // マーケティングヘッダー（デフォルト）
  return <MarketingHeader className={className} />;
}

// 各ヘッダーコンポーネントの再エクスポート
export { MarketingHeader } from "./MarketingHeader";
export { AppHeader } from "./AppHeader";
export { GuestHeader } from "./GuestHeader";
export { UserMenu } from "./UserMenu";
export { NavLink, MobileNavLink } from "./NavLink";

// 型定義の再エクスポート
export type {
  GlobalHeaderProps,
  HeaderVariant,
  NavLinkProps,
  UserMenuProps,
  MarketingHeaderProps,
  AppHeaderProps,
  GuestHeaderProps,
} from "./types";
