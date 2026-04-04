"use client";
import type { JSX } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@core/utils";

import { NavLinkProps } from "./types";

/**
 * ナビゲーションリンクコンポーネント
 *
 * 現在位置の判定は `aria-current` 付与にのみ使い、見た目のアクティブ装飾は行いません。
 *
 * @param href - リンク先URL
 * @param children - 子要素
 * @param className - カスタムクラス名
 * @param exactMatch - 完全一致判定（デフォルト: false）
 * @param icon - アイコン要素
 */
export function NavLink({
  href,
  children,
  className,
  exactMatch = false,
  icon,
}: NavLinkProps): JSX.Element {
  const pathname = usePathname();

  const isActive = exactMatch ? pathname === href : pathname.startsWith(href) && href !== "/"; // ルートパスの特別処理

  const finalClassName = cn(
    "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-md",
    className
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
  exactMatch = false,
  icon,
  onClick,
}: NavLinkProps & { onClick?: () => void }): JSX.Element {
  const pathname = usePathname();

  const isActive = exactMatch ? pathname === href : pathname.startsWith(href) && href !== "/";

  const finalClassName = cn(
    "flex items-center gap-3 px-4 py-3 text-base font-medium transition-all duration-200 hover:text-primary hover:bg-primary/5 rounded-lg",
    className
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
