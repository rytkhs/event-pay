import type { ReactNode } from "react";

import { DemoBanner } from "@features/demo";

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
    <div className="flex flex-col min-h-screen">
      <DemoBanner />
      <GlobalHeader variant="guest" />
      <div className="flex-1 flex flex-col">{children}</div>
      <GlobalFooter />
    </div>
  );
}
