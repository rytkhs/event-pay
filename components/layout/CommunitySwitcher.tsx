"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Check, ChevronsUpDown, CreditCard, Loader2, LogOut, Plus, Settings } from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";

import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

const LOGOUT_ERROR_MESSAGE = "ログアウトに失敗しました。再度お試しください。";

type CommunitySwitcherProps = {
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
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
  user,
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
  const userName = user?.name || user?.email || "ゲスト";
  const userEmail = user?.email || "";
  const userInitial = getInitials(userName);
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
          className="h-auto min-h-[3.75rem] items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5 transition-all duration-200 hover:bg-sidebar-accent/60 hover:border-sidebar-primary/30 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0"
          disabled={isCommunityPending || isStripePending || isLogoutPending}
        >
          {/* コミュニティアバター */}
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${communityGradient} text-white text-sm font-bold shadow-sm`}
          >
            {communityInitial}
          </div>

          {/* コミュニティ名 */}
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-[13px] font-semibold leading-snug text-sidebar-foreground">
              {currentCommunityName}
            </p>
            <p className="text-[10px] font-medium text-sidebar-foreground/50 leading-none mt-0.5">
              コミュニティ
            </p>
          </div>

          <ChevronsUpDown className="ml-auto size-3.5 text-sidebar-foreground/40 shrink-0 group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[22rem] rounded-xl border-border/60 p-2 shadow-xl"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        {/* ユーザー情報 */}
        <div className="flex items-center gap-3 px-2 py-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15 text-sidebar-primary text-xs font-bold">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground leading-snug">
              {userName}
            </p>
            {userEmail ? (
              <p className="truncate text-[11px] text-muted-foreground leading-snug">{userEmail}</p>
            ) : null}
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* コミュニティ切り替え */}
        <DropdownMenuLabel className="px-2 pb-1.5 pt-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-muted-foreground/70">
          コミュニティ
        </DropdownMenuLabel>

        {workspace.ownedCommunities.map((community) => {
          const isCurrent = community.id === workspace.currentCommunity?.id;
          const isPendingRow = pendingCommunityId === community.id && isCommunityPending;
          const gradient = getCommunityGradient(community.name);
          const initial = getInitials(community.name);

          return (
            <DropdownMenuItem
              key={community.id}
              onSelect={(event) => {
                event.preventDefault();
                handleSwitch(community.id);
              }}
              disabled={isCurrent || isPendingRow}
              className="cursor-pointer rounded-lg px-2 py-2 gap-2.5"
            >
              <div
                className={`flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br ${gradient} text-white text-[10px] font-bold`}
              >
                {initial}
              </div>
              <span className="truncate flex-1 text-sm font-medium">{community.name}</span>
              {isPendingRow ? (
                <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
              ) : isCurrent ? (
                <div className="flex size-4 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/15">
                  <Check className="size-2.5 text-sidebar-primary" />
                </div>
              ) : null}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuItem asChild className="mt-0.5 cursor-pointer rounded-lg px-2 py-2 gap-2.5">
          <Link
            href="/communities/create"
            className="font-medium"
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-muted-foreground/30">
              <Plus className="size-3 text-muted-foreground" />
            </div>
            <span className="text-sm">コミュニティを作成</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleStripeDashboard();
          }}
          disabled={isStripePending}
          className="cursor-pointer rounded-lg px-3 py-2 font-medium gap-2.5"
        >
          {isStripePending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />
          ) : (
            <CreditCard className="size-4 text-muted-foreground shrink-0" />
          )}
          <span className="text-sm">Stripe ダッシュボード</span>
        </DropdownMenuItem>

        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg px-3 py-2 font-medium gap-2.5"
        >
          <Link href="/settings" onClick={() => setIsMenuOpen(false)}>
            <Settings className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm">設定</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleLogout();
          }}
          disabled={isLogoutPending}
          className="cursor-pointer rounded-lg px-3 py-2 font-medium text-destructive focus:text-destructive gap-2.5"
        >
          {isLogoutPending ? (
            <Loader2 className="size-4 animate-spin shrink-0" />
          ) : (
            <LogOut className="size-4 shrink-0" />
          )}
          <span className="text-sm">{isLogoutPending ? "ログアウト中..." : "ログアウト"}</span>
        </DropdownMenuItem>

        {logoutError ? (
          <div
            className="mt-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
            aria-live="assertive"
          >
            {logoutError}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
