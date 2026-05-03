import { createElement } from "react";

import { Home, Calendar, Settings, Plus } from "lucide-react";

import { NavigationConfig, NavItem } from "./types";

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
      label: "デモ",
      href: `${process.env.NEXT_PUBLIC_DEMO_URL || "https://demo.minnano-shukin.com"}/start-demo`,
      exactMatch: false,
    },
  ],

  /**
   * アプリケーション用ナビゲーション
   * 認証済みユーザー向けの管理画面で使用
   */
  app: [
    {
      label: "ホーム",
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
   * モバイルの主要タブナビゲーション
   */
  mobileTabs: [
    {
      label: "ホーム",
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
    {
      label: "作成",
      href: "/events/create",
      icon: createElement(Plus),
      exactMatch: false,
    },
    {
      label: "設定",
      href: "/settings",
      icon: createElement(Settings),
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
 * ガイドドロップダウン用ナビゲーション
 */
export const guideNavigation: NavItem[] = [
  {
    label: "主催者のはじめ方",
    href: "/guide/getting-started",
    exactMatch: false,
  },
  {
    label: "参加者の登録・支払いの流れ",
    href: "/guide/participant-flow",
    exactMatch: false,
  },
  {
    label: "オンライン集金・入金のしくみ",
    href: "/guide/online-collection",
    exactMatch: false,
  },
  {
    label: "料金と手数料",
    href: "/guide/pricing-and-fees",
    exactMatch: false,
  },
];

/**
 * マーケティングページのCTAボタン設定
 */
export const marketingCTA = {
  label: "無料ではじめる",
  href: "/register",
  variant: "default" as const,
};
