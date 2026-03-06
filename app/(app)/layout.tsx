import type { ReactNode } from "react";

import { requireCurrentAppUserForServerComponent } from "@core/auth/auth-utils";

import { DemoBanner } from "@features/demo";

import { AppSidebar } from "@components/layout/AppSidebar";
import { Header } from "@components/layout/Header";

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
  const currentUser = await requireCurrentAppUserForServerComponent();

  return (
    <SidebarProvider>
      <AppSidebar
        user={currentUser}
        logoutAction={logoutAction}
        createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
      />
      <SidebarInset>
        <DemoBanner />
        <Header />
        <main className="flex-1 flex flex-col p-2 sm:p-4 w-full max-w-7xl mx-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
