"use client";

import { useMemo, useState } from "react";

import Link from "next/link";

import {
  Check,
  ChevronsUpDown,
  CreditCard,
  ExternalLink,
  Loader2,
  LogOut,
  Plus,
} from "lucide-react";

import type { AppWorkspaceShellData } from "@core/community/app-workspace";
import type { ActionResult } from "@core/errors/adapters/server-actions";

import { cn } from "@/components/ui/_lib/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";

import { useWorkspaceMenuActions } from "./use-workspace-menu-actions";

type CommunitySwitcherProps = {
  workspace: AppWorkspaceShellData;
  logoutAction: () => Promise<ActionResult>;
  createExpressDashboardLoginLinkAction: () => Promise<void>;
};

type OwnedCommunity = AppWorkspaceShellData["ownedCommunities"][number];

const DEFAULT_COMMUNITY_ACCENT = "bg-sidebar-primary";

const COMMUNITY_ACCENTS = [
  "bg-teal-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-indigo-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-cyan-500",
  "bg-blue-500",
  "bg-pink-500",
];

/** コミュニティ名からイニシャルを取得（最大2文字） */
function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  // 日本語はそのまま1文字
  const firstChar = [...trimmed][0];
  return firstChar.toUpperCase();
}

function hashCommunityId(communityId: string): number {
  let hash = 2166136261;

  for (const character of communityId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function buildCommunityAccentMap(
  communities: readonly OwnedCommunity[]
): Map<string, string> {
  const sortedCommunities = [...communities].sort((a, b) => {
    const hashDiff = hashCommunityId(a.id) - hashCommunityId(b.id);
    if (hashDiff !== 0) return hashDiff;
    return a.id.localeCompare(b.id);
  });

  return new Map(
    sortedCommunities.map((community, index) => [
      community.id,
      COMMUNITY_ACCENTS[index % COMMUNITY_ACCENTS.length],
    ])
  );
}

export function CommunitySwitcher({
  workspace,
  logoutAction,
  createExpressDashboardLoginLinkAction,
}: CommunitySwitcherProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
    onMenuClose: () => setIsMenuOpen(false),
  });

  const communityAccentMap = useMemo(
    () => buildCommunityAccentMap(workspace.ownedCommunities),
    [workspace.ownedCommunities]
  );
  const currentCommunityName = workspace.currentCommunity?.name ?? "コミュニティ未作成";
  const communityInitial = getInitials(currentCommunityName);
  const communityAccent = workspace.currentCommunity
    ? (communityAccentMap.get(workspace.currentCommunity.id) ?? DEFAULT_COMMUNITY_ACCENT)
    : DEFAULT_COMMUNITY_ACCENT;

  return (
    <DropdownMenu
      open={isMenuOpen}
      onOpenChange={(open) => {
        setIsMenuOpen(open);
        resetLogoutError();
      }}
    >
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="h-auto min-h-[3.65rem] group-data-[collapsible=icon]:min-h-0 items-center gap-3 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/35 px-3 py-2 transition-colors duration-150 hover:border-sidebar-primary/20 hover:bg-sidebar-accent/65 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0"
          disabled={isCommunityPending || isStripePending || isLogoutPending}
        >
          {/* コミュニティアバター */}
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${communityAccent} text-sm font-bold text-white`}
          >
            {communityInitial}
          </div>

          {/* コミュニティ名 */}
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="mt-0.5 text-[11px] font-medium leading-none text-sidebar-foreground/50">
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
        className="w-[20rem] overflow-hidden rounded-xl border-border/70 p-0 shadow-lg"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <div className="flex flex-col gap-4 p-3">
          {/* コミュニティ切り替え */}
          <section className="space-y-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              コミュニティ
            </p>
            <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
              {workspace.ownedCommunities.map((community) => {
                const isCurrent = community.id === workspace.currentCommunity?.id;
                const isPendingRow = pendingCommunityId === community.id && isCommunityPending;
                const rowCommunityAccent =
                  communityAccentMap.get(community.id) ?? DEFAULT_COMMUNITY_ACCENT;
                const rowCommunityInitial = getInitials(community.name);

                return (
                  <DropdownMenuItem
                    key={community.id}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleCommunitySwitch(community.id);
                    }}
                    disabled={isCurrent || isCommunityPending}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors",
                      isCurrent ? "bg-primary/5 text-foreground" : "text-foreground",
                      "focus:bg-muted/50 focus:text-foreground",
                      "disabled:opacity-100"
                    )}
                  >
                    <div
                      className={`flex size-6 shrink-0 items-center justify-center rounded-md ${rowCommunityAccent} text-[11px] font-bold text-white`}
                    >
                      {rowCommunityInitial}
                    </div>
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
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border/70 px-3 py-2.5 text-sm font-medium text-foreground transition-colors focus:bg-muted/40 focus:text-foreground"
            >
              <Link href="/communities/create" onClick={() => setIsMenuOpen(false)}>
                <Plus className="h-4 w-4 text-muted-foreground" />
                コミュニティを作成
              </Link>
            </DropdownMenuItem>
          </section>

          {/* 運営ツール */}
          <section className="space-y-2">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              運営ツール
            </p>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleStripeDashboard();
              }}
              disabled={isStripePending}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition-colors focus:bg-muted/60 focus:text-foreground disabled:opacity-60"
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
            <p className="px-1 text-xs font-medium text-muted-foreground">
              アカウント
            </p>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
              disabled={isLogoutPending}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-destructive transition-colors focus:bg-destructive/5 focus:text-destructive disabled:opacity-60"
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
