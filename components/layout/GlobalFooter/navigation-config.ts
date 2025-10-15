import { FooterLink } from "./types";

/**
 * フッターナビゲーションリンクの設定
 */
export const footerNavigationLinks: FooterLink[] = [
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
  {
    label: "お問い合わせ",
    href: "/contact",
    ariaLabel: "みんなの集金へのお問い合わせフォーム",
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
    copyright: "© 2025 みんなの集金. All rights reserved.",
  },

  /**
   * バリアント別の表示制御
   */
  displaySettings: {
    compact: {
      showBranding: true,
      showNavigation: true,
      showCopyright: true,
    },
    minimal: {
      showBranding: false,
      showNavigation: false,
      showCopyright: true,
    },
  },
} as const;
