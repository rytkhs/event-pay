import type { Metadata } from "next";

import { getCanonicalUrl } from "@core/utils/canonical-url";

export const metadata: Metadata = {
  alternates: {
    canonical: getCanonicalUrl("/contact"),
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <>{children}</>;
}
