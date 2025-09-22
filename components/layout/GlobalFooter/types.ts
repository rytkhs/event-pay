/**
 * グローバルフッター関連の型定義
 */

/**
 * フッターの表示バリアント
 */
export type FooterVariant =
  | "compact" // 標準表示（ブランディング + ナビゲーション + コピーライト）
  | "minimal"; // 最小限表示（コピーライトのみ）

/**
 * フッターリンクの定義
 */
export interface FooterLink {
  /** リンクのラベル */
  label: string;
  /** リンク先URL */
  href: string;
  /** 外部リンクかどうか */
  external?: boolean;
  /** アクセシビリティ用のaria-label */
  ariaLabel?: string;
  /** アイコン（オプション） */
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * グローバルフッターのProps
 */
export interface GlobalFooterProps {
  /** フッターの表示バリアント */
  variant?: FooterVariant;
  /** カスタムCSSクラス */
  className?: string;
  /** 特定ページでの非表示制御 */
  hideOnPages?: string[];
  /** カスタムリンクの追加 */
  customLinks?: FooterLink[];
}

/**
 * フッターコンテンツのProps
 */
export interface FooterContentProps {
  variant: FooterVariant;
  className?: string;
}

/**
 * フッターリンク群のProps
 */
export interface FooterLinksProps {
  links: FooterLink[];
  variant: FooterVariant;
  className?: string;
}

/**
 * フッターブランディングのProps
 */
export interface FooterBrandingProps {
  variant: FooterVariant;
  className?: string;
}
