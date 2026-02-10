import type { ReactNode } from "react";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { MarketingHeader } from "@components/layout/GlobalHeader/MarketingHeader";

/**
 * 公開ページレイアウト
 *
 * お問い合わせ、法的文書などの公開ページ用のレイアウト。
 * マーケティングヘッダーとフッターを表示します。
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
