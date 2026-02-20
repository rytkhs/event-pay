import type { ReactNode, JSX } from "react";

import type { Metadata } from "next";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { GlobalHeader } from "@components/layout/GlobalHeader/GlobalHeader";

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
    <div className="min-h-screen flex flex-col">
      <GlobalHeader variant="minimal" />
      <main className="flex-grow flex flex-col justify-center bg-gray-50">{children}</main>
      <GlobalFooter />
    </div>
  );
}
