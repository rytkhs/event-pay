"use client";

import { useState, useEffect } from "react";

import { cn } from "@core/utils";

import { Button } from "@components/ui/button";

import { navigationConfig, marketingCTA } from "./navigation-config";
import { NavLink } from "./NavLink";
import { MarketingHeaderProps } from "./types";

/**
 * マーケティングページ用ヘッダーコンポーネント
 * 未認証ユーザー向けのランディングページで使用
 */
export function MarketingHeader({ className }: MarketingHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  // スクロールによるヘッダーの見た目変更
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

              {/* ログインリンク */}
              <NavLink
                href="/login"
                className="ml-4 text-sm font-medium text-muted-foreground hover:text-foreground border-b-0 hover:border-b-0 hover:bg-transparent"
              >
                ログイン
              </NavLink>

              {/* CTA ボタン */}
              <Button asChild variant={marketingCTA.variant} size="sm" className="ml-2">
                <NavLink href={marketingCTA.href}>{marketingCTA.label}</NavLink>
              </Button>
            </nav>

            {/* モバイル用ナビゲーション */}
            <div className="md:hidden flex items-center space-x-2">
              {/* モバイル用ログインリンク */}
              <NavLink
                href="/login"
                className="text-sm font-medium text-muted-foreground hover:text-foreground border-b-0 hover:border-b-0 hover:bg-transparent px-2 py-1"
              >
                ログイン
              </NavLink>

              {/* モバイル用CTA ボタン */}
              <Button asChild variant={marketingCTA.variant} size="sm">
                <NavLink href={marketingCTA.href}>{marketingCTA.label}</NavLink>
              </Button>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
