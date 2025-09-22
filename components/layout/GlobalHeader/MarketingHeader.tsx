"use client";

import { useState, useEffect } from "react";

import { Menu, X } from "lucide-react";

import { cn } from "@core/utils";

import { Button } from "@components/ui/button";

import { navigationConfig, marketingCTA } from "./navigation-config";
import { NavLink, MobileNavLink } from "./NavLink";
import { MarketingHeaderProps } from "./types";

/**
 * マーケティングページ用ヘッダーコンポーネント
 * 未認証ユーザー向けのランディングページで使用
 */
export function MarketingHeader({ className }: MarketingHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // スクロールによるヘッダーの見た目変更
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // モバイルメニューの開閉
  const handleMobileMenuToggle = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // スムーズスクロール機能（既存のランディングページ機能を再現）
  const handleSmoothScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const element = document.querySelector(targetId);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
    closeMobileMenu();
  };

  return (
    <>
      {/* メインヘッダー */}
      <header
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          isScrolled
            ? "bg-background/95 backdrop-blur-md border-b border-border/50 py-2"
            : "bg-background/80 backdrop-blur-sm border-b border-border/30 py-4",
          className
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            {/* ブランドロゴ */}
            <div className="flex items-center">
              <NavLink
                href="/"
                className="text-xl sm:text-2xl font-bold text-primary hover:bg-transparent border-b-0 hover:border-b-0"
                exactMatch={true}
              >
                みんなの集金
              </NavLink>
            </div>

            {/* デスクトップナビゲーション */}
            <nav className="hidden md:flex items-center space-x-1">
              {navigationConfig.marketing.map((item) => {
                // ハッシュリンクかどうか判定
                const isHashLink = item.href.startsWith("/#");

                if (isHashLink) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-md"
                      onClick={(e) => handleSmoothScroll(e, item.href.substring(1))}
                    >
                      {item.icon && <span className="h-4 w-4 flex-shrink-0">{item.icon}</span>}
                      {item.label}
                    </a>
                  );
                }

                return (
                  <NavLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    exactMatch={item.exactMatch}
                  >
                    {item.label}
                  </NavLink>
                );
              })}

              {/* CTA ボタン */}
              <Button asChild variant={marketingCTA.variant} size="sm" className="ml-4">
                <NavLink href={marketingCTA.href}>{marketingCTA.label}</NavLink>
              </Button>
            </nav>

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
              {navigationConfig.marketing.map((item) => {
                // ハッシュリンクかどうか判定
                const isHashLink = item.href.startsWith("/#");

                if (isHashLink) {
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 px-4 py-3 text-base font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-lg"
                      onClick={(e) => handleSmoothScroll(e, item.href.substring(1))}
                      role="menuitem"
                    >
                      {item.icon && <span className="h-5 w-5 flex-shrink-0">{item.icon}</span>}
                      {item.label}
                    </a>
                  );
                }

                return (
                  <MobileNavLink
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    exactMatch={item.exactMatch}
                    onClick={closeMobileMenu}
                  >
                    {item.label}
                  </MobileNavLink>
                );
              })}

              {/* モバイル用 CTA ボタン */}
              <div className="pt-4 border-t border-border">
                <Button asChild variant={marketingCTA.variant} size="default" className="w-full">
                  <MobileNavLink href={marketingCTA.href} onClick={closeMobileMenu}>
                    {marketingCTA.label}
                  </MobileNavLink>
                </Button>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
