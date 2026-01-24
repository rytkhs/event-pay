"use client";

import { useState, useRef, useEffect } from "react";

import { LogOut, User, ChevronDown, ChevronRight } from "lucide-react";

import { cn } from "@core/utils";

import { Separator } from "@components/ui/separator";

import { userMenuItems } from "./navigation-config";
import { UserMenuProps } from "./types";

/**
 * ユーザーメニューコンポーネント
 * 認証済みユーザーのドロップダウンメニューを提供
 */
export function UserMenu({
  user,
  className,
  isMobile = false,
  logoutAction,
  onItemClick,
}: UserMenuProps & {
  isMobile?: boolean;
  onItemClick?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 外部クリックでメニューを閉じる
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // キーボード操作
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const toggleMenu = () => {
    setIsOpen(!isOpen);
  };

  const closeMenu = () => {
    setIsOpen(false);
    onItemClick?.();
  };

  const handleLogoutClick = async () => {
    setIsLoggingOut(true);
    try {
      if (logoutAction) {
        await logoutAction();
      } else {
        window.location.href = "/login";
      }
      // リダイレクトが実行されるため、以降の処理は不要
    } catch (error) {
      console.error("Logout failed:", error);
      // エラー時も強制的にログインページへリダイレクト
      window.location.href = "/login";
    }
    // setIsLoggingOut(false) は不要（ページが破棄されるため）
  };

  // モバイル版（ログアウトボタンのみ）
  if (isMobile) {
    return (
      <button
        onClick={handleLogoutClick}
        disabled={isLoggingOut}
        className="group w-full flex items-center justify-between px-4 py-4 text-base font-medium transition-all duration-200 text-red-600 hover:text-red-700 hover:bg-red-50/80 rounded-xl disabled:opacity-50"
      >
        <div className="flex items-center space-x-3">
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span>{isLoggingOut ? "ログアウト中..." : "ログアウト"}</span>
        </div>
        {!isLoggingOut && (
          <ChevronRight className="h-4 w-4 text-red-400 group-hover:text-red-600 transition-colors" />
        )}
      </button>
    );
  }

  // デスクトップ版（ドロップダウンメニュー）
  return (
    <div className={cn("relative", className)} ref={menuRef}>
      {/* メニューボタン */}
      <button
        ref={buttonRef}
        onClick={toggleMenu}
        className={cn(
          "flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors hover:bg-muted",
          isOpen && "bg-muted"
        )}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="ユーザーメニューを開く"
      >
        <User className="h-4 w-4" />
        <span className="hidden sm:inline max-w-32 truncate">{user.name || user.email}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform duration-200", isOpen && "rotate-180")}
        />
      </button>

      {/* ドロップダウンメニュー */}
      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-56 bg-popover rounded-md shadow-lg ring-1 ring-border z-50"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
        >
          <div className="py-1">
            {/* ユーザー情報 */}
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-medium text-foreground truncate">
                {user.name || user.email}
              </p>
              <p className="text-xs text-muted-foreground">ログイン中</p>
            </div>

            {/* メニューアイテム */}
            <div className="py-1">
              {userMenuItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="group flex items-center px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                  role="menuitem"
                  onClick={closeMenu}
                >
                  {item.icon && (
                    <span className="h-4 w-4 mr-3 text-muted-foreground group-hover:text-foreground">
                      {item.icon}
                    </span>
                  )}
                  {item.label}
                </a>
              ))}
            </div>

            <Separator />

            {/* ログアウトボタン */}
            <div className="py-1">
              <button
                onClick={handleLogoutClick}
                disabled={isLoggingOut}
                className="group flex items-center w-full px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                role="menuitem"
              >
                <LogOut className="h-4 w-4 mr-3" />
                {isLoggingOut ? "ログアウト中..." : "ログアウト"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
