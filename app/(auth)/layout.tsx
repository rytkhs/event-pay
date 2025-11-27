import type { ReactNode } from "react";

import type { Metadata } from "next";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { GlobalHeader } from "@components/layout/GlobalHeader";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

/**
 * 認証ページレイアウト
 *
 * ログイン、サインアップ、パスワードリセットなどの認証ページ専用のレイアウト。
 * 最小限のヘッダー（minimal variant）とフッターを表示します。
 *
 * 使用コンポーネント:
 * - GlobalHeader: variant="minimal"で最小限のヘッダーを表示（静的）
 * - GlobalFooter: 静的Server Componentとして実装されたフッター
 *
 * このレイアウトは静的プリレンダリング可能です。
 */
export default function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <GlobalHeader variant="minimal" />
      <main>{children}</main>
      <GlobalFooter />
    </>
  );
}
