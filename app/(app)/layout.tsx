import type { ReactNode } from "react";

import { redirect } from "next/navigation";

import {
  resolveAppWorkspaceForServerComponent,
  toAppWorkspaceShellData,
} from "@core/community/app-workspace";

import { DemoBanner } from "@features/demo";

import { AppSidebar } from "@components/layout/AppSidebar";
import { Header } from "@components/layout/Header";
import { MobileChromeProvider } from "@components/layout/mobile-chrome-context";
import { MobileAppChrome } from "@components/layout/MobileAppChrome";

import { logoutAction } from "@/app/(auth)/actions";
import { createExpressDashboardLoginLinkAction } from "@/app/_actions/stripe-connect/actions";
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

  if (workspace.isCommunityEmptyState) {
    redirect("/communities/create");
  }

  const workspaceShell = toAppWorkspaceShellData(workspace);

  return (
    <SidebarProvider>
      <MobileChromeProvider>
        <AppSidebar
          workspace={workspaceShell}
          logoutAction={logoutAction}
          createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
        />
        <SidebarInset>
          <DemoBanner />
          <Header />
          <MobileAppChrome
            workspace={workspaceShell}
            logoutAction={logoutAction}
            createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
          />
          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-2 pb-[calc(var(--app-mobile-tabbar-height)+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(var(--app-mobile-tabbar-height)+env(safe-area-inset-bottom))] md:pb-4">
            {children}
          </main>
        </SidebarInset>
      </MobileChromeProvider>
    </SidebarProvider>
  );
}
