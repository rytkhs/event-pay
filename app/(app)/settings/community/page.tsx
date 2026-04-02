import { redirect } from "next/navigation";

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { requireNonEmptyCommunityWorkspaceForServerComponent } from "@core/community/app-workspace";
import { createServerComponentSupabaseClient } from "@core/supabase/factory";

import { CurrentCommunitySettingsOverview } from "@features/communities";
import { getCurrentCommunitySettings } from "@features/communities/server";

import { deleteCommunityAction, updateCommunityAction } from "@/app/(app)/actions/communities";

export const metadata: Metadata = {
  title: "コミュニティ設定",
  description: "現在選択中コミュニティの基本情報と決済状態を確認します",
};

export default async function CommunitySettingsPage() {
  const workspace = await requireNonEmptyCommunityWorkspaceForServerComponent();
  const currentCommunity = workspace.currentCommunity;

  if (!currentCommunity) {
    redirect("/dashboard");
  }

  const supabase = await createServerComponentSupabaseClient();
  const settings = await getCurrentCommunitySettings(
    supabase,
    workspace.currentUser.id,
    currentCommunity.id
  );

  if (!settings.success) {
    throw settings.error;
  }

  if (!settings.data) {
    redirect("/dashboard");
  }

  return (
    <CurrentCommunitySettingsOverview
      deleteCommunityAction={deleteCommunityAction}
      settings={settings.data}
      updateCommunityAction={updateCommunityAction}
    />
  );
}
