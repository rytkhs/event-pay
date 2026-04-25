import { FooterLinkGroup } from "./types";

/**
 * フッターナビゲーションリンクの設定
 */
export const footerNavigationGroups: FooterLinkGroup[] = [
  {
    title: "Service",
    links: [
      {
        label: "はじめての方へ",
        href: "/about",
        ariaLabel: "みんなの集金の使い方を確認する",
      },
      {
        label: "機能一覧",
        href: "/features",
        ariaLabel: "みんなの集金の機能を確認する",
      },
      {
        label: "料金プラン",
        href: "/pricing",
        ariaLabel: "みんなの集金の料金プランを確認する",
      },
    ],
  },
  {
    title: "Support",
    links: [
      {
        label: "運営元",
        href: "https://project.tklab.workers.dev/",
        external: true,
        ariaLabel: "みんなの集金の運営元を確認する",
      },
      {
        label: "お問い合わせ",
        href: "/contact",
        ariaLabel: "みんなの集金へのお問い合わせフォーム",
      },
      {
        label: "フィードバック",
        href: "/feedback",
        ariaLabel: "みんなの集金へのフィードバックフォーム",
      },
    ],
  },
  {
    title: "Legal",
    links: [
      {
        label: "利用規約",
        href: "/terms",
        ariaLabel: "みんなの集金の利用規約を確認する",
      },
      {
        label: "プライバシーポリシー",
        href: "/privacy",
        ariaLabel: "みんなの集金のプライバシーポリシーを確認する",
      },
      {
        label: "特定商取引法に基づく表記",
        href: "/tokushoho/platform",
        ariaLabel: "みんなの集金プラットフォームの特定商取引法に基づく表記",
      },
    ],
  },
];

/**
 * フッター設定
 */
export const footerConfig = {
  /**
   * ブランド情報
   */
  brand: {
    name: "みんなの集金",
    tagline: "集金をもっとラクに",
    copyright: "© 2025 みんなの集金. All rights reserved.",
  },

  /**
   * 表示制御
   */
  displaySettings: {
    showBranding: true,
    showNavigation: true,
    showCopyright: true,
  },
} as const;
