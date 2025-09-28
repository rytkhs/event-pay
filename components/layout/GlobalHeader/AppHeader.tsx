"use client";

import { useState } from "react";

import { Menu, X } from "lucide-react";

import { cn } from "@core/utils";

import { navigationConfig } from "./navigation-config";
import { NavLink, MobileNavLink } from "./NavLink";
import { AppHeaderProps } from "./types";
import { UserMenu } from "./UserMenu";

/**
 * アプリケーション用ヘッダーコンポーネント
 * 認証済みユーザー向けの管理画面で使用
 */
export function AppHeader({ user, className }: AppHeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* メインヘッダー */}
      <header
        className={cn(
          "bg-background/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50",
          className
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* ブランドロゴ */}
            <div className="flex items-center">
              <NavLink
                href="/dashboard"
                className="text-xl sm:text-2xl font-bold text-primary hover:bg-transparent border-b-0 hover:border-b-0"
                exactMatch={false}
              >
                みんなの集金
              </NavLink>
            </div>

            {/* デスクトップナビゲーション */}
            <nav className="hidden md:flex items-center space-x-1">
              {navigationConfig.app.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  exactMatch={item.exactMatch}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* 右側エリア */}
            <div className="flex items-center space-x-4">
              {/* ユーザーメニュー（デスクトップ） */}
              <div className="hidden md:block">
                <UserMenu user={user} />
              </div>

              {/* モバイルメニューボタン */}
              <button
                className="md:hidden p-2 rounded-md hover:bg-muted transition-colors"
                onClick={handleMobileMenuToggle}
                aria-label="メニューを開く"
                aria-expanded={isMobileMenuOpen}
                aria-controls="mobile-menu"
              >
                {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* モバイルメニュー */}
      {isMobileMenuOpen && (
        <div id="mobile-menu" className="fixed inset-0 top-16 z-40 md:hidden" role="menu">
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />

          {/* メニューコンテンツ */}
          <div className="relative bg-background border-b border-border shadow-lg">
            <nav className="px-4 py-6 space-y-2" role="none">
              {/* メインナビゲーション */}
              {navigationConfig.app.map((item) => (
                <MobileNavLink
                  key={item.href}
                  href={item.href}
                  icon={item.icon}
                  exactMatch={item.exactMatch}
                  onClick={closeMobileMenu}
                >
                  {item.label}
                </MobileNavLink>
              ))}

              {/* ユーザー情報とメニュー */}
              <div className="pt-4 border-t border-border space-y-2">
                {/* ユーザー情報表示 */}
                <div className="px-4 py-2">
                  <p className="text-sm font-medium text-foreground">{user.name || user.email}</p>
                  <p className="text-xs text-muted-foreground">ログイン中</p>
                </div>

                {/* ユーザーメニューアイテム（モバイル用） */}
                <UserMenu user={user} isMobile={true} onItemClick={closeMobileMenu} />
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
