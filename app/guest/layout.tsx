import type { ReactNode, JSX } from "react";

import { DemoBanner } from "@features/demo";

/**
 * ゲストページレイアウト
 *
 * ゲストトークンからアクセスするゲストページ専用のレイアウト。
 */
export default function GuestLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <DemoBanner />
      {children}
    </>
  );
}
