"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Check, CreditCard, ExternalLink, Loader2, LogOut, Menu, Plus } from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import type { ActionResult } from "@core/errors/adapters/server-actions";

import { navigationConfig } from "@/components/layout/GlobalHeader/navigation-config";
import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

import { useMobileChrome } from "./mobile-chrome-context";
import { isMobileTabActive, resolveMobilePageConfig } from "./mobile-navigation";
import { useMobileKeyboardOpen } from "./use-mobile-keyboard";
import { useWorkspaceMenuActions } from "./use-workspace-menu-actions";

type MobileAppChromeProps = {
  workspace: AppWorkspaceShellData;
  logoutAction: () => Promise<ActionResult>;
  createExpressDashboardLoginLinkAction: () => Promise<void>;
};

export function MobileAppChrome({
  workspace,
  logoutAction,
  createExpressDashboardLoginLinkAction,
}: MobileAppChromeProps) {
  const pathname = usePathname();
  const pageConfig = useMemo(() => resolveMobilePageConfig(pathname), [pathname]);
  const isKeyboardOpen = useMobileKeyboardOpen();
  const { isBottomOverlayOpen } = useMobileChrome();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const {
    handleCommunitySwitch,
    handleStripeDashboard,
    handleLogout,
    pendingCommunityId,
    isCommunityPending,
    isStripePending,
    isLogoutPending,
    logoutError,
    resetLogoutError,
  } = useWorkspaceMenuActions({
    currentCommunityId: workspace.currentCommunity?.id,
    logoutAction,
    createExpressDashboardLoginLinkAction,
    onMenuClose: () => setIsMoreOpen(false),
  });

  const shouldShowTabs = pageConfig.showTabs && !isKeyboardOpen && !isBottomOverlayOpen;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90 md:hidden">
        <div className="flex h-[var(--app-mobile-header-height)] items-center gap-2 px-3">
          {pageConfig.backHref ? (
            <Button asChild variant="ghost" size="icon" className="-ml-1 h-9 w-9 shrink-0">
              <Link href={pageConfig.backHref} aria-label="戻る">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 18l-6-6 6-6"
                  />
                </svg>
              </Link>
            </Button>
          ) : (
            <div className="w-1 shrink-0" aria-hidden="true" />
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{pageConfig.title}</p>
          </div>

          <div className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              aria-label="メニュー"
              onClick={() => setIsMoreOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {shouldShowTabs ? (
        <nav className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-4 right-4 z-40 mx-auto max-w-lg md:hidden">
          <div className="rounded-full border border-border/50 bg-background/80 px-2 py-2 shadow-2xl shadow-black/10 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
            <div className="flex items-center justify-around">
              {navigationConfig.mobileTabs.map((item) => {
                const isActive = isMobileTabActive(item.href, pageConfig.activeNav);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 transition-all duration-300",
                      isActive
                        ? "text-primary"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {isActive && (
                      <div className="absolute inset-0 z-0 rounded-full bg-primary/10 transition-all duration-500" />
                    )}
                    <span
                      className={cn(
                        "relative z-10 flex h-5 items-center justify-center transition-transform duration-300",
                        isActive && "scale-110"
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="relative z-10 text-[10px] font-medium leading-none">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      ) : null}

      <Sheet
        open={isMoreOpen}
        onOpenChange={(open) => {
          setIsMoreOpen(open);
          resetLogoutError();
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-border/70 px-0 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 md:hidden"
        >
          {/* <SheetHeader className="px-5 text-left">
            <SheetTitle>メニュー</SheetTitle>
          </SheetHeader> */}

          <div className="mt-5 space-y-5 px-5">
            <section className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                コミュニティを切り替える
              </p>
              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
                {workspace.ownedCommunities.map((community) => {
                  const isCurrent = community.id === workspace.currentCommunity?.id;
                  const isPendingRow = pendingCommunityId === community.id && isCommunityPending;

                  return (
                    <button
                      key={community.id}
                      type="button"
                      onClick={() => handleCommunitySwitch(community.id)}
                      disabled={isCommunityPending || isCurrent}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
                        isCurrent
                          ? "bg-primary/5 text-foreground"
                          : "text-foreground hover:bg-muted/50",
                        "disabled:opacity-100"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{community.name}</p>
                      </div>
                      {isPendingRow ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : isCurrent ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      ) : // ) : (<ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />)}
                      null}
                    </button>
                  );
                })}
              </div>
              <Link
                href="/communities/create"
                className="flex items-center gap-3 rounded-2xl border border-dashed border-border/70 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
                onClick={() => setIsMoreOpen(false)}
              >
                <Plus className="h-4 w-4 text-muted-foreground" />
                コミュニティを作成
              </Link>
            </section>

            <section className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                運営ツール
              </p>

              <button
                type="button"
                onClick={handleStripeDashboard}
                disabled={isStripePending}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-60"
              >
                {isStripePending ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="flex-1">Stripeダッシュボード</span>
                {!isStripePending && (
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
              </button>
            </section>

            <section className="space-y-2">
              <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                アカウント
              </p>

              {/* <Link
                href="/settings"
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
                onClick={() => setIsMoreOpen(false)}
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                設定
              </Link> */}

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLogoutPending}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-60"
              >
                {isLogoutPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                ログアウト
              </button>
              {logoutError ? (
                <p className="px-4 text-xs text-destructive" role="alert">
                  {logoutError}
                </p>
              ) : null}
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
