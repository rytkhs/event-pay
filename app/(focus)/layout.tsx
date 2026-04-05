import type { ReactNode } from "react";

/**
 * フォーカスレイアウト
 *
 * サイドバー・グローバルヘッダーを持たない全画面レイアウト。
 * コミュニティ作成など、単一アクションに集中させたいページで使用します。
 */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
