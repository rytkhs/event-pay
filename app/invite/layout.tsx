import type { ReactNode } from "react";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { GlobalHeader } from "@components/layout/GlobalHeader";

/**
 * 招待ページレイアウト
 *
 * 招待トークンからアクセスする招待ページ専用のレイアウト。
 * ゲストヘッダー（guest variant）とフッターを表示します。
 *
 * 使用コンポーネント:
 * - GlobalHeader: variant="guest"でゲスト用ヘッダーを表示（静的）
 * - GlobalFooter: 静的Server Componentとして実装されたフッター
 *
 * このレイアウトは動的レンダリングされます（トークン検証のため）。
 */
export default function InviteLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <GlobalHeader variant="guest" />
      <main>{children}</main>
      <GlobalFooter />
    </>
  );
}
