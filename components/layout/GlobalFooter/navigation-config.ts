import { FooterLinkGroup } from "./types";

/**
 * フッターナビゲーションリンクの設定
 */
export const footerNavigationGroups: FooterLinkGroup[] = [
  {
    title: "サービス",
    links: [
      {
        label: "機能",
        href: "/#features",
        ariaLabel: "みんなの集金の機能を見る",
      },
      {
        label: "料金",
        href: "/#pricing",
        ariaLabel: "みんなの集金の料金を見る",
      },
      {
        label: "デモ",
        href: `${process.env.NEXT_PUBLIC_DEMO_URL || "https://demo.minnano-shukin.com"}/start-demo`,
        external: true,
        ariaLabel: "みんなの集金のデモを見る",
      },
    ],
  },
  {
    title: "ガイド",
    links: [
      {
        label: "参加者画面の流れ",
        href: "/guide/participant-flow",
        ariaLabel: "参加者画面の流れを確認する",
      },
      {
        label: "オンライン集金のしくみ",
        href: "/guide/online-collection",
        ariaLabel: "オンライン集金のしくみを確認する",
      },
      {
        label: "料金と手数料",
        href: "/guide/pricing-and-fees",
        ariaLabel: "料金と手数料の詳細を確認する",
      },
      {
        label: "キャンセル・返金時の扱い",
        href: "/guide/cancellation",
        ariaLabel: "キャンセル・返金時の扱いを確認する",
      },
      {
        label: "よくある質問",
        href: "/#faq",
        ariaLabel: "よくある質問を確認する",
      },
    ],
  },
  {
    title: "サポート",
    links: [
      {
        label: "フィードバック",
        href: "/feedback",
        ariaLabel: "みんなの集金へのフィードバックフォーム",
      },
      {
        label: "お問い合わせ",
        href: "/contact",
        ariaLabel: "みんなの集金へのお問い合わせフォーム",
      },
      {
        label: "運営元",
        href: "https://project.tklab.workers.dev/",
        external: true,
        ariaLabel: "みんなの集金の運営元を確認する",
      },
    ],
  },
  {
    title: "法的情報",
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
    tagline: "参加費・会費の集金をまとめて管理",
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
