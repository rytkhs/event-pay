"use client";

import { Menu, ChevronRight } from "lucide-react";

import { cn } from "@core/utils";

import { Button } from "@components/ui/button";
import { Separator } from "@components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@components/ui/sheet";

import { navigationConfig, userMenuItems } from "./navigation-config";
import { NavLink, MobileNavLink } from "./NavLink";
import { AppHeaderProps } from "./types";
import { UserMenu } from "./UserMenu";

/**
 * アプリケーション用ヘッダーコンポーネント
 * 認証済みユーザー向けの管理画面で使用
 */
export function AppHeader({ user, logoutAction, className }: AppHeaderProps) {
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
                <UserMenu user={user} logoutAction={logoutAction} />
              </div>

              {/* モバイルメニュー（Sheet） */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    aria-label="メニューを開く"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full max-w-xs flex flex-col">
                  <SheetHeader className="flex-shrink-0">
                    <SheetTitle>メニュー</SheetTitle>
                  </SheetHeader>

                  <div className="flex-1 overflow-y-auto">
                    <div className="mt-6 space-y-6">
                      {/* プロフィールセクション */}
                      <div className="px-4 py-4 bg-muted/30 rounded-xl border border-border/50">
                        <div className="flex items-center space-x-3">
                          {/* ユーザーイニシャル */}
                          <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-primary">
                              {(user.name || user.email)?.[0]?.toUpperCase() || "U"}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {user.name || user.email}
                            </p>
                            <p className="text-xs text-muted-foreground">ログイン中</p>
                          </div>
                        </div>
                      </div>

                      {/* メインナビゲーション */}
                      <nav className="space-y-1">
                        {[...navigationConfig.app, ...navigationConfig.mobile].map((item) => (
                          <div key={item.href} className="group">
                            <MobileNavLink
                              href={item.href}
                              exactMatch={item.exactMatch}
                              className="flex items-center justify-between px-4 py-4 text-base font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-xl"
                            >
                              <div className="flex items-center space-x-3">
                                {item.icon && (
                                  <span className="h-5 w-5 flex-shrink-0">{item.icon}</span>
                                )}
                                <span>{item.label}</span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </MobileNavLink>
                          </div>
                        ))}
                      </nav>

                      {/* 設定セクション */}
                      <div className="space-y-1">
                        <Separator className="mb-4" />

                        {userMenuItems.map((item) => (
                          <div key={item.href} className="group">
                            <MobileNavLink
                              href={item.href}
                              className="flex items-center justify-between px-4 py-4 text-base font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-xl"
                            >
                              <div className="flex items-center space-x-3">
                                {item.icon && (
                                  <span className="h-5 w-5 flex-shrink-0">{item.icon}</span>
                                )}
                                <span>{item.label}</span>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </MobileNavLink>
                          </div>
                        ))}

                        <Separator className="my-4" />

                        {/* ログアウトセクション */}
                        <UserMenu user={user} isMobile={true} logoutAction={logoutAction} />
                      </div>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
