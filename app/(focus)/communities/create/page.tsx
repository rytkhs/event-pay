import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { resolveAppWorkspaceForServerComponent } from "@core/community/app-workspace";

import { CreateCommunityForm } from "@features/communities";

import { createCommunityAction } from "@/app/(app)/actions/communities";
import { logoutAction } from "@/app/(auth)/actions";

export const metadata: Metadata = {
  title: "コミュニティ作成",
  description: "イベントを束ねるコミュニティを作成します",
};

export default async function CreateCommunityPage() {
  const workspace = await resolveAppWorkspaceForServerComponent();

  return (
    <CreateCommunityForm
      createCommunityAction={createCommunityAction}
      logoutAction={logoutAction}
      hasOwnedCommunities={workspace.hasOwnedCommunities}
    />
  );
}
