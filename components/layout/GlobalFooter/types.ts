/**
 * グローバルフッター関連の型定義
 */

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
  /** フッター内で強調表示するかどうか */
  featured?: boolean;
}

/**
 * フッターリンクグループの定義
 */
export interface FooterLinkGroup {
  /** グループのタイトル */
  title: string;
  /** グループ内のリンク */
  links: FooterLink[];
}
