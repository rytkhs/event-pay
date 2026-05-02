"use client";

import { useState, useEffect, useRef } from "react";

import Link from "next/link";

import { cn } from "@core/utils";

import { navigationConfig, marketingCTA, guideNavigation } from "./navigation-config";
import { NavLink } from "./NavLink";
import { MarketingHeaderProps } from "./types";

/**
 * マーケティングページ用ヘッダーコンポーネント
 * 未認証ユーザー向けのランディングページで使用
 */
export function MarketingHeader({ className }: MarketingHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);

  // スクロールによるヘッダーの見た目変更
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ガイドドロップダウン外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (guideRef.current && !guideRef.current.contains(e.target as Node)) {
        setIsGuideOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
                className="text-lg sm:text-xl md:text-2xl font-bold text-primary hover:bg-transparent border-b-0 hover:border-b-0 whitespace-nowrap"
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
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-md"
                      onClick={(e) => handleSmoothScroll(e, item.href.substring(1))}
                    >
                      {item.icon && <span className="h-4 w-4 flex-shrink-0">{item.icon}</span>}
                      {item.label}
                    </Link>
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

              {/* ガイドドロップダウン */}
              <div ref={guideRef} className="relative">
                <button
                  onClick={() => setIsGuideOpen(!isGuideOpen)}
                  className={cn(
                    "inline-flex items-center gap-1 px-3 py-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-md",
                    isGuideOpen && "text-primary bg-primary/5"
                  )}
                >
                  ガイド
                  <svg
                    className={cn(
                      "w-3.5 h-3.5 transition-transform duration-200",
                      isGuideOpen && "rotate-180"
                    )}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isGuideOpen && (
                  <div className="absolute top-full right-0 mt-1 w-56 bg-background rounded-lg shadow-xl border border-border/50 py-2 z-50">
                    {guideNavigation.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block px-4 py-2.5 text-sm text-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                        onClick={() => setIsGuideOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* ログインリンク */}
              <NavLink
                href="/login"
                className="ml-4 text-sm font-bold text-primary hover:underline border-b-0 hover:border-b-0 hover:bg-transparent"
              >
                ログイン
              </NavLink>

              {/* CTA ボタン */}
              <Link
                href={marketingCTA.href}
                className="ml-2 bg-primary hover:bg-primary/80 text-white px-5 py-2 rounded-full font-bold transition-all shadow-lg hover:shadow-blue-200"
              >
                {marketingCTA.label}
              </Link>
            </nav>

            {/* モバイル用ナビゲーション */}
            <div className="md:hidden flex items-center space-x-1">
              {/* モバイル用ログインリンク */}
              <NavLink
                href="/login"
                className="text-xs sm:text-sm font-bold text-primary hover:underline border-b-0 hover:border-b-0 hover:bg-transparent px-1 py-1 whitespace-nowrap"
              >
                ログイン
              </NavLink>

              {/* モバイル用CTA ボタン */}
              <Link
                href={marketingCTA.href}
                className="text-xs bg-primary hover:bg-primary/80 text-white px-4 py-2 rounded-full font-bold transition-all shadow-lg hover:shadow-blue-200 whitespace-nowrap"
              >
                {marketingCTA.label}
              </Link>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
