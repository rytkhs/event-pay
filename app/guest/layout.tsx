import type { ReactNode } from "react";

import { DemoBanner } from "@/features/demo/components/demo-banner";

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
