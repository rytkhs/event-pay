import type { ReactNode } from "react";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { MarketingHeader } from "@components/layout/GlobalHeader";

/**
 * マーケティングレイアウト
 *
 * マーケティングページ専用のレイアウト。
 * 認証状態を一切読み取らず、Cookie/headers/searchParamsを参照しないため、
 * 静的プリレンダリングが可能です。
 *
 * 使用コンポーネント:
 * - MarketingHeader: クライアントコンポーネントだが静的プリレンダ可能
 * - GlobalFooter: 静的Server Componentとして実装されたフッター
 */
export default function MarketingLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <MarketingHeader />
      <main>{children}</main>
      <GlobalFooter />
    </>
  );
}
