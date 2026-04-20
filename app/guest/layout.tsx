import type { ReactNode, JSX } from "react";

import { DemoBanner } from "@features/demo";

import { PublicFooter } from "@components/layout/PublicFooter";

/**
 * ゲストページレイアウト
 *
 * ゲストトークンからアクセスするゲストページ専用のレイアウト。
 */
export default function GuestLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen">
      <DemoBanner />
      <div className="flex-1 flex flex-col">{children}</div>
      <PublicFooter />
    </div>
  );
}
