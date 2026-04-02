import type { JSX, ReactNode } from "react";

import { CommunityFooter } from "@components/layout/CommunityFooter";
import { PublicHeader } from "@components/layout/GlobalHeader/PublicHeader";

type PublicCommunityShellProps = {
  children: ReactNode;
  communitySlug: string;
  legalSlug: string;
};

export function PublicCommunityShell({
  children,
  communitySlug,
  legalSlug,
}: PublicCommunityShellProps): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="flex-grow">{children}</main>
      <CommunityFooter communitySlug={communitySlug} legalSlug={legalSlug} />
    </div>
  );
}
