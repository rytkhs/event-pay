import type { ReactNode } from "react";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { MarketingHeader } from "@components/layout/GlobalHeader";

/**
 * 公開ページレイアウト
 *
 * お問い合わせ、法的文書などの公開ページ用のレイアウト。
 * マーケティングヘッダーとフッターを表示します。
 *
 * 使用コンポーネント:
 * - MarketingHeader: クライアントコンポーネントだが静的プリレンダ可能
 * - GlobalFooter: 静的Server Componentとして実装されたフッター
 *
 * このレイアウトは静的プリレンダリング可能です。
 */
export default function PublicLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <MarketingHeader />
      <main>{children}</main>
      <GlobalFooter />
    </>
  );
}
