import { createElement } from "react";

import { Home, Calendar, Settings, Plus } from "lucide-react";

import { NavigationConfig } from "./types";

/**
 * アプリケーション全体のナビゲーション設定
 */
export const navigationConfig: NavigationConfig = {
  /**
   * マーケティングページ用ナビゲーション
   * 未認証ユーザー向けのランディングページで使用
   */
  marketing: [
    {
      label: "機能",
      href: "/#features",
      exactMatch: false,
    },
    {
      label: "料金",
      href: "/#pricing",
      exactMatch: false,
    },
    {
      label: "FAQ",
      href: "/#faq",
      exactMatch: false,
    },
  ],

  /**
   * アプリケーション用ナビゲーション
   * 認証済みユーザー向けの管理画面で使用
   */
  app: [
    {
      label: "ダッシュボード",
      href: "/dashboard",
      icon: createElement(Home),
      exactMatch: false,
    },
    {
      label: "イベント",
      href: "/events",
      icon: createElement(Calendar),
      exactMatch: false,
    },
  ],

  /**
   * モバイル専用ナビゲーション
   * ハンバーガーメニューでのみ使用される追加項目
   */
  mobile: [
    {
      label: "新規イベント作成",
      href: "/events/create",
      icon: createElement(Plus),
      exactMatch: false,
    },
  ],

  /**
   * ゲスト用ナビゲーション
   * 招待リンクからアクセスしたゲストユーザー向け
   */
  guest: [
    // ゲストページは基本的に単一ページなのでナビゲーションは最小限
  ],
};

/**
 * マーケティングページのCTAボタン設定
 */
export const marketingCTA = {
  label: "無料で始める",
  href: "/register",
  variant: "default" as const,
};

/**
 * ユーザーメニューの設定
 */
export const userMenuItems = [
  // {
  //   label: "精算レポート",
  //   href: "/dashboard/settlement-reports",
  //   icon: createElement(FileText),
  // },
  {
    label: "設定",
    href: "/settings",
    icon: createElement(Settings),
  },
] as const;
