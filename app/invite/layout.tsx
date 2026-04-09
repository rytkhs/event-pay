import type { ReactNode, JSX } from "react";

import { DemoBanner } from "@features/demo";

import { GlobalFooter } from "@components/layout/GlobalFooter";

/**
 * 招待ページレイアウト
 */
export default function InviteLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col min-h-screen">
      <DemoBanner />
      <div className="flex-1 flex flex-col">{children}</div>
      <GlobalFooter />
    </div>
  );
}
