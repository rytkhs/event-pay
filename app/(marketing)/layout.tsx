import type { ReactNode } from "react";

import { MarketingHeader } from "@components/layout/GlobalHeader";
import { StaticFooter } from "@components/layout/GlobalFooter/StaticFooter";

/**
 * マーケティングレイアウト
 *
 * マーケティングページ専用のレイアウト。
 * 認証状態を一切読み取らず、Cookie/headers/searchParamsを参照しないため、
 * 静的プリレンダリングが可能です。
 *
 * 使用コンポーネント:
 * - MarketingHeader: クライアントコンポーネントだが静的プリレンダ可能
 * - StaticFooter: 認証不要の簡易フッター
 */
export default function MarketingLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <MarketingHeader />
      <main>{children}</main>
      <StaticFooter />
    </>
  );
}
