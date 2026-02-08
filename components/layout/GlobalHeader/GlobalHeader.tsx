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
 * variantが指定されている場合はそれを使用し（自動判定をスキップ）、
 * 指定されていない場合は認証状態とパスに基づいて自動判定します。
 *
 * @param user - 認証ユーザー情報
 * @param variant - ヘッダーの種類（指定時は自動判定をスキップ）
 * @param hideOnScroll - スクロール時の非表示制御
 * @param className - カスタムクラス名
 */
export function GlobalHeader({
  user,
  logoutAction,
  variant,
  hideOnScroll: _hideOnScroll = false,
  className,
}: GlobalHeaderProps) {
  // React Hooksは常にトップレベルで呼び出す必要がある
  // variantが指定されていない場合のみ使用するが、ルールに従って常に呼び出す
  const pathname = usePathname();

  // variantが指定されている場合は早期リターン（自動判定をスキップ）
  if (variant) {
    switch (variant) {
      case "minimal":
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
      case "guest":
        return <GuestHeader attendance={undefined} className={className} />;
      case "app":
        if (!user) {
          // フォールバック（通常は発生しない）
          return <MarketingHeader className={className} />;
        }
        return <AppHeader user={user} logoutAction={logoutAction} className={className} />;
      case "marketing":
        return <MarketingHeader className={className} />;
    }
  }

  // variant未指定時のみ自動判定を実行（後方互換性のため）

  const currentVariant: HeaderVariant = (() => {
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
  })();

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
    return <AppHeader user={user} logoutAction={logoutAction} className={className} />;
  }

  // マーケティングヘッダー（デフォルト）
  return <MarketingHeader className={className} />;
}
