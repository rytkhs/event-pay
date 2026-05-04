"use client";

import { useState, useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@core/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { navigationConfig, marketingCTA, guideNavigation } from "./navigation-config";
import { NavLink } from "./NavLink";
import { MarketingHeaderProps } from "./types";

/**
 * マーケティングページ用ヘッダーコンポーネント
 * 未認証ユーザー向けのランディングページで使用
 */
export function MarketingHeader({ className }: MarketingHeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

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
    if (pathname !== "/") {
      return;
    }

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
            <nav className="hidden items-center gap-1 md:flex">
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200 hover:bg-primary/5 hover:text-primary data-[state=open]:bg-primary/5 data-[state=open]:text-primary"
                  >
                    ガイド
                    <svg
                      className="size-3.5 transition-transform duration-200"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={4}
                  className="w-56 border-border/50 shadow-xl"
                >
                  <DropdownMenuGroup>
                    {guideNavigation.map((item) => (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        className="cursor-pointer px-3 py-2.5 text-sm text-foreground transition-colors focus:bg-primary/5 focus:text-primary"
                      >
                        <Link href={item.href}>{item.label}</Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

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
            <div className="flex items-center gap-1 md:hidden">
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
