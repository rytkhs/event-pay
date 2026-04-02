import type { ReactNode } from "react";

import { resolveCommunityAnnouncementForServerComponent } from "@core/announcements/community-announcement";
import {
  resolveAppWorkspaceForServerComponent,
  toAppWorkspaceShellData,
} from "@core/community/app-workspace";

import { DemoBanner } from "@features/demo";

import { AppSidebar } from "@components/layout/AppSidebar";
import { Header } from "@components/layout/Header";

import { logoutAction } from "@/app/(auth)/actions";
import { createExpressDashboardLoginLinkAction } from "@/app/_actions/stripe-connect/actions";
import { CommunityAnnouncementBanner } from "@/app/_components/CommunityAnnouncementBanner";
import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * アプリケーションレイアウト
 *
 * 認証済みユーザー向けアプリケーション領域のレイアウト。
 * アプリケーションサイドバー（AppSidebar）とメインコンテンツエリアを提供します。
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  ensureFeaturesRegistered();
  const workspace = await resolveAppWorkspaceForServerComponent();
  const communityAnnouncement = await resolveCommunityAnnouncementForServerComponent(
    workspace.currentUser.id
  );
  const workspaceShell = toAppWorkspaceShellData(workspace);

  return (
    <SidebarProvider>
      <AppSidebar
        user={workspace.currentUser}
        workspace={workspaceShell}
        logoutAction={logoutAction}
        createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
      />
      <SidebarInset>
        <DemoBanner />
        {communityAnnouncement.shouldShow ? (
          <CommunityAnnouncementBanner userName={workspace.currentUser.name} />
        ) : null}
        <Header workspace={workspaceShell} />
        <main className="flex-1 flex flex-col p-2 sm:p-4 w-full max-w-7xl mx-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
