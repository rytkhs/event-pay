"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Check,
  ChevronsUpDown,
  CreditCard,
  LayoutGrid,
  Loader2,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";

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
          className="h-auto min-h-[4.25rem] items-start rounded-xl border border-sidebar-border/70 bg-sidebar-accent/40 px-3 py-3 shadow-sm hover:bg-sidebar-accent/70 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0"
          disabled={isCommunityPending || isStripePending || isLogoutPending}
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary/10 text-sidebar-primary">
            <LayoutGrid className="size-4" />
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {currentCommunityName}
            </p>
          </div>
          <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="w-[21rem] rounded-xl border-border/70 p-2"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <div className="px-2 pb-2 pt-1">
          <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
          {userEmail ? <p className="truncate text-xs text-muted-foreground">{userEmail}</p> : null}
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuLabel className="px-2 pb-1 pt-0 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
          コミュニティを切り替える
        </DropdownMenuLabel>
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
              className="cursor-pointer rounded-lg px-3 py-2"
            >
              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate font-medium">{community.name}</span>
                {isPendingRow ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : isCurrent ? (
                  <Check className="size-4 text-primary" />
                ) : null}
              </div>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuItem asChild className="mt-1 cursor-pointer rounded-lg px-3 py-2">
          <Link
            href="/communities/create"
            className="font-medium"
            onClick={() => setIsMenuOpen(false)}
          >
            <Plus className="size-4 text-muted-foreground" />
            コミュニティを作成
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleStripeDashboard();
          }}
          disabled={isStripePending}
          className="cursor-pointer rounded-lg px-3 py-2 font-medium"
        >
          {isStripePending ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : (
            <CreditCard className="size-4 text-muted-foreground" />
          )}
          Stripe ダッシュボード
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2 font-medium">
          <Link href="/settings" onClick={() => setIsMenuOpen(false)}>
            <Settings className="size-4 text-muted-foreground" />
            設定
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            handleLogout();
          }}
          disabled={isLogoutPending}
          className="cursor-pointer rounded-lg px-3 py-2 font-medium text-destructive focus:text-destructive"
        >
          {isLogoutPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          {isLogoutPending ? "ログアウト中..." : "ログアウト"}
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
