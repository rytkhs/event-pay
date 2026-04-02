import React from "react";

import { type User as SupabaseUser } from "@supabase/supabase-js";

/**
 * 拡張されたユーザー型（nameプロパティを含む）
 */
export interface User extends SupabaseUser {
  name?: string;
}

/**
 * ヘッダーバリアント定義
 */
export type HeaderVariant = "marketing" | "guest" | "minimal";

/**
 * グローバルヘッダーのプロパティ
 */
export interface GlobalHeaderProps {
  /** ヘッダーの種類 */
  variant?: HeaderVariant;
  /** スクロール時の非表示制御 */
  hideOnScroll?: boolean;
  /** カスタムクラス名 */
  className?: string;
}

/**
 * NavLinkコンポーネントのプロパティ
 */
export interface NavLinkProps {
  /** リンク先URL */
  href: string;
  /** 子要素 */
  children: React.ReactNode;
  /** カスタムクラス名 */
  className?: string;
  /** アクティブ時のクラス名 */
  activeClassName?: string;
  /** 完全一致判定（デフォルト: false） */
  exactMatch?: boolean;
  /** アイコン要素 */
  icon?: React.ReactNode;
}

/**
 * マーケティングヘッダーのプロパティ
 */
export interface MarketingHeaderProps {
  /** カスタムクラス名 */
  className?: string;
}

/**
 * ゲストヘッダーのプロパティ
 */
export interface GuestHeaderProps {
  /** カスタムクラス名 */
  className?: string;
}

/**
 * ナビゲーションアイテム定義
 */
export interface NavItem {
  /** 表示ラベル */
  label: string;
  /** リンク先URL */
  href: string;
  /** アイコン */
  icon?: React.ReactNode;
  /** 完全一致判定 */
  exactMatch?: boolean;
}

/**
 * ナビゲーション設定
 */
export interface NavigationConfig {
  /** マーケティングナビゲーション */
  marketing: NavItem[];
  /** アプリケーションナビゲーション */
  app: NavItem[];
  /** モバイル専用ナビゲーション（ハンバーガーメニューのみ） */
  mobile: NavItem[];
  /** ゲストナビゲーション */
  guest: NavItem[];
}
