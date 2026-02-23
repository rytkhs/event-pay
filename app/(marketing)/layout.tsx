import type { ReactNode, JSX } from "react";

import { GlobalFooter } from "@components/layout/GlobalFooter";
import { MarketingHeader } from "@components/layout/GlobalHeader/MarketingHeader";

export default function MarketingLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <>
      <MarketingHeader />
      <main>{children}</main>
      <GlobalFooter />
    </>
  );
}
