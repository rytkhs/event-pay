"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@core/utils";

import { NavLinkProps } from "./types";

/**
 * アクティブ状態対応ナビゲーションリンクコンポーネント
 *
 * 現在のパスに基づいてアクティブ状態を自動検出し、視覚的なフィードバックを提供します。
 *
 * @param href - リンク先URL
 * @param children - 子要素
 * @param className - カスタムクラス名
 * @param activeClassName - アクティブ時のクラス名
 * @param exactMatch - 完全一致判定（デフォルト: false）
 * @param icon - アイコン要素
 */
export function NavLink({
  href,
  children,
  className,
  activeClassName,
  exactMatch = false,
  icon,
}: NavLinkProps): JSX.Element {
  const pathname = usePathname();

  // アクティブ状態の判定
  const isActive = exactMatch ? pathname === href : pathname.startsWith(href) && href !== "/"; // ルートパスの特別処理

  // デフォルトのアクティブクラス
  const defaultActiveClass = "text-primary border-b-2 border-primary font-medium";

  // 最終的なクラス名を計算
  const finalClassName = cn(
    // 基本スタイル
    "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-md border-b-2 border-transparent",
    // カスタムクラス
    className,
    // アクティブ状態のクラス
    isActive && (activeClassName ?? defaultActiveClass)
  );

  return (
    <Link href={href} className={finalClassName} aria-current={isActive ? "page" : undefined}>
      {icon && <span className="h-4 w-4 flex-shrink-0">{icon}</span>}
      {children}
    </Link>
  );
}

/**
 * モバイル向けNavLinkコンポーネント
 * タップ領域が大きく、縦方向のレイアウトに適応
 */
export function MobileNavLink({
  href,
  children,
  className,
  activeClassName,
  exactMatch = false,
  icon,
  onClick,
}: NavLinkProps & { onClick?: () => void }): JSX.Element {
  const pathname = usePathname();

  const isActive = exactMatch ? pathname === href : pathname.startsWith(href) && href !== "/";

  const defaultActiveClass = "text-primary bg-primary/10 font-medium";

  const finalClassName = cn(
    // モバイル向けの基本スタイル（大きなタップ領域）
    "flex items-center gap-3 px-4 py-3 text-base font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-lg",
    isActive && (activeClassName ?? defaultActiveClass),
    className // classNameを最後にして上書き可能にする
  );

  return (
    <Link
      href={href}
      className={finalClassName}
      aria-current={isActive ? "page" : undefined}
      onClick={onClick}
    >
      {icon && <span className="h-5 w-5 flex-shrink-0">{icon}</span>}
      {children}
    </Link>
  );
}
