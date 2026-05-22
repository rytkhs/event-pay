import { Suspense, type ReactNode } from "react";

import { redirect } from "next/navigation";

import {
  PAYOUT_REQUEST_IN_APP_BANNER,
  shouldShowPayoutRequestInAppBanner,
} from "@core/announcements/app-banner";
import {
  resolveAppWorkspaceForServerComponent,
  toAppWorkspaceShellData,
} from "@core/community/app-workspace";

import { DemoBanner } from "@features/demo";

import { AppAnnouncementBanner } from "@components/layout/AppAnnouncementBanner";
import { AppSidebar } from "@components/layout/AppSidebar";
import { AppSidebarFallback } from "@components/layout/AppSidebarFallback";
import { Header } from "@components/layout/Header";
import { MobileChromeProvider } from "@components/layout/mobile-chrome-context";
import { MobileAppChrome } from "@components/layout/MobileAppChrome";
import { MobileAppChromeFallback } from "@components/layout/MobileAppChromeFallback";

import { dismissPayoutRequestInAppBannerAction } from "@/app/(app)/announcement-banner/actions";
import { logoutAction } from "@/app/(auth)/actions";
import { createExpressDashboardLoginLinkAction } from "@/app/_actions/stripe-connect/actions";
import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * 認証済みユーザー向けアプリケーション領域の静的な外枠。
 * workspace 解決前でも shell と子ページの loading UI を stream できるようにする。
 */
function StaticAppShell({
  children,
  sidebar,
  mobileChrome,
  banners = null,
}: {
  children: ReactNode;
  sidebar: ReactNode;
  mobileChrome: ReactNode;
  banners?: ReactNode;
}) {
  return (
    <SidebarProvider>
      <MobileChromeProvider>
        {sidebar}
        <SidebarInset>
          {banners}
          <Header />
          {mobileChrome}
          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col p-2 pb-[calc(var(--app-mobile-tabbar-height)+env(safe-area-inset-bottom))] sm:p-4 sm:pb-[calc(var(--app-mobile-tabbar-height)+env(safe-area-inset-bottom))] md:pb-4">
            {children}
          </main>
        </SidebarInset>
      </MobileChromeProvider>
    </SidebarProvider>
  );
}

function AppShellFallback({ children }: { children: ReactNode }) {
  return (
    <StaticAppShell sidebar={<AppSidebarFallback />} mobileChrome={<MobileAppChromeFallback />}>
      {children}
    </StaticAppShell>
  );
}

async function WorkspaceAppShell({ children }: { children: ReactNode }) {
  const workspace = await resolveAppWorkspaceForServerComponent();

  if (workspace.isCommunityEmptyState) {
    redirect("/communities/create");
  }

  const workspaceShell = toAppWorkspaceShellData(workspace);
  const showPayoutRequestBanner = await shouldShowPayoutRequestInAppBanner(
    workspace.currentUser.createdAt
  );

  return (
    <StaticAppShell
      sidebar={
        <AppSidebar
          workspace={workspaceShell}
          logoutAction={logoutAction}
          createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
        />
      }
      mobileChrome={
        <MobileAppChrome
          workspace={workspaceShell}
          logoutAction={logoutAction}
          createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
        />
      }
      banners={
        <>
          <DemoBanner />
          {showPayoutRequestBanner && (
            <AppAnnouncementBanner
              announcementPath={PAYOUT_REQUEST_IN_APP_BANNER.announcementPath}
              dismissAction={dismissPayoutRequestInAppBannerAction}
            />
          )}
        </>
      }
    >
      {children}
    </StaticAppShell>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  ensureFeaturesRegistered();

  return (
    <Suspense fallback={<AppShellFallback>{children}</AppShellFallback>}>
      <WorkspaceAppShell>{children}</WorkspaceAppShell>
    </Suspense>
  );
}
