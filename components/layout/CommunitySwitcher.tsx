"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Check,
  ChevronsUpDown,
  CreditCard,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";

import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";
import { cn } from "@/components/ui/_lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

const LOGOUT_ERROR_MESSAGE = "ログアウトに失敗しました。再度お試しください。";

type CommunitySwitcherProps = {
  workspace: AppWorkspaceShellData;
  logoutAction: () => Promise<ActionResult>;
  createExpressDashboardLoginLinkAction: () => Promise<void>;
};

/** コミュニティ名からイニシャルを取得（最大2文字） */
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // 日本語はそのまま1文字
  const firstChar = [...trimmed][0];
  return firstChar.toUpperCase();
}

/** 一貫したグラデーションカラーをコミュニティ名から決定 */
function getCommunityGradient(name: string): string {
  const gradients = [
    "from-teal-500 to-cyan-400",
    "from-violet-500 to-indigo-400",
    "from-emerald-500 to-teal-400",
    "from-sky-500 to-blue-400",
    "from-rose-500 to-pink-400",
    "from-amber-500 to-orange-400",
  ];
  const index = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % gradients.length;
  return gradients[index];
}

export function CommunitySwitcher({
  workspace,
  logoutAction,
  createExpressDashboardLoginLinkAction,
}: CommunitySwitcherProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [pendingCommunityId, setPendingCommunityId] = useState<string | null>(null);
  const [isCommunityPending, startCommunityTransition] = useTransition();
  const [isStripePending, startStripeTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();

  const currentCommunityName = workspace.currentCommunity?.name ?? "コミュニティ未作成";
  const communityInitial = getInitials(currentCommunityName);
  const communityGradient = getCommunityGradient(currentCommunityName);

  const handleSwitch = (communityId: string) => {
    if (communityId === workspace.currentCommunity?.id) {
      return;
    }

    setPendingCommunityId(communityId);

    startCommunityTransition(async () => {
      const result = await updateCurrentCommunityAction(communityId);

      if (!result.success) {
        toast({
          title: "通信に失敗しました",
          description: result.error.userMessage,
          variant: "destructive",
        });
        setPendingCommunityId(null);
        return;
      }

      toast({
        title: "コミュニティを切り替えました",
      });
      setPendingCommunityId(null);
      setIsMenuOpen(false);
      router.refresh();
    });
  };

  const handleStripeDashboard = () => {
    startStripeTransition(async () => {
      await createExpressDashboardLoginLinkAction();
      setIsMenuOpen(false);
    });
  };

  const handleLogout = () => {
    setLogoutError(null);

    startLogoutTransition(async () => {
      try {
        const result = await logoutAction();

        if (!result.success) {
          setLogoutError(result.error.userMessage || LOGOUT_ERROR_MESSAGE);
          return;
        }

        window.location.href = result.redirectUrl || "/login";
      } catch {
        setLogoutError(LOGOUT_ERROR_MESSAGE);
      }
    });
  };

  return (
    <DropdownMenu
      open={isMenuOpen}
      onOpenChange={(open) => {
        setIsMenuOpen(open);
        if (!open) {
          setLogoutError(null);
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="h-auto min-h-[3.9rem] group-data-[collapsible=icon]:min-h-0 items-center gap-3 rounded-xl border border-sidebar-border/70 bg-white/55 px-3 py-2 shadow-[0_1px_0_hsl(var(--sidebar-primary-foreground)/0.55)] backdrop-blur-sm transition-all duration-200 hover:border-sidebar-primary/25 hover:bg-sidebar-accent/65 hover:shadow-[0_8px_20px_-18px_hsl(var(--sidebar-primary)/0.9)] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0 group-data-[collapsible=icon]:shadow-none"
          disabled={isCommunityPending || isStripePending || isLogoutPending}
        >
          {/* コミュニティアバター */}
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${communityGradient} text-sm font-bold text-white shadow-[0_10px_18px_-12px_rgba(15,23,42,0.8)]`}
          >
            {communityInitial}
          </div>

          {/* コミュニティ名 */}
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="mt-0.5 text-[10px] font-semibold leading-none tracking-[0.14em] text-sidebar-foreground/45">
              コミュニティ
            </p>
            <p className="truncate text-[13px] font-semibold leading-snug text-sidebar-foreground">
              {currentCommunityName}
            </p>
          </div>

          <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-sidebar-foreground/35 group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[20rem] overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <div className="flex flex-col gap-5 p-4">
          {/* コミュニティ切り替え */}
          <section className="space-y-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              コミュニティを切り替える
            </p>
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
              {workspace.ownedCommunities.map((community) => {
                const isCurrent = community.id === workspace.currentCommunity?.id;
                const isPendingRow = pendingCommunityId === community.id && isCommunityPending;

                return (
                  <DropdownMenuItem
                    key={community.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleSwitch(community.id);
                    }}
                    disabled={isCurrent || isPendingRow}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
                      isCurrent ? "bg-primary/5 text-foreground" : "text-foreground",
                      "focus:bg-muted/50 focus:text-foreground",
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
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </div>

            <DropdownMenuItem
              asChild
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border/70 px-4 py-3 text-sm font-medium text-foreground transition-colors focus:bg-muted/40 focus:text-foreground"
            >
              <Link href="/communities/create" onClick={() => setIsMenuOpen(false)}>
                <Plus className="h-4 w-4 text-muted-foreground" />
                コミュニティを作成
              </Link>
            </DropdownMenuItem>
          </section>

          {/* 運営ツール */}
          <section className="space-y-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              運営ツール
            </p>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleStripeDashboard();
              }}
              disabled={isStripePending}
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-foreground transition-colors focus:bg-muted/60 focus:text-foreground disabled:opacity-60"
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
            </DropdownMenuItem>
          </section>

          {/* アカウント */}
          <section className="space-y-2">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              アカウント
            </p>
            <DropdownMenuItem
              asChild
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-foreground transition-colors focus:bg-muted/60 focus:text-foreground"
            >
              <Link href="/settings" onClick={() => setIsMenuOpen(false)}>
                <Settings className="h-4 w-4 text-muted-foreground" />
                設定
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
              disabled={isLogoutPending}
              className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-destructive transition-colors focus:bg-destructive/5 focus:text-destructive disabled:opacity-60"
            >
              {isLogoutPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              ログアウト
            </DropdownMenuItem>
            {logoutError ? (
              <p className="px-4 text-xs text-destructive" role="alert">
                {logoutError}
              </p>
            ) : null}
          </section>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
