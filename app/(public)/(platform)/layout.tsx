import type { ReactNode, JSX } from "react";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { MarketingHeader } from "@components/layout/GlobalHeader/MarketingHeader";

export default function PlatformLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <MarketingHeader />
      <main className="flex-grow pt-20">{children}</main>
      <GlobalFooter />
    </div>
  );
}
