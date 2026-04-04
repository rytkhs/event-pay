"use client";

import { useCallback, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";

import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";

const LOGOUT_ERROR_MESSAGE = "ログアウトに失敗しました。再度お試しください。";

type UseWorkspaceMenuActionsParams = {
  currentCommunityId: string | null | undefined;
  logoutAction: () => Promise<ActionResult>;
  createExpressDashboardLoginLinkAction: () => Promise<void>;
  onMenuClose?: () => void;
};

export function useWorkspaceMenuActions({
  currentCommunityId,
  logoutAction,
  createExpressDashboardLoginLinkAction,
  onMenuClose,
}: UseWorkspaceMenuActionsParams) {
  const router = useRouter();
  const { toast } = useToast();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [pendingCommunityId, setPendingCommunityId] = useState<string | null>(null);
  const [isCommunityPending, startCommunityTransition] = useTransition();
  const [isStripePending, startStripeTransition] = useTransition();
  const [isLogoutPending, startLogoutTransition] = useTransition();

  const closeMenu = useCallback(() => {
    onMenuClose?.();
  }, [onMenuClose]);

  const resetLogoutError = useCallback(() => {
    setLogoutError(null);
  }, []);

  const handleCommunitySwitch = useCallback(
    (communityId: string) => {
      if (communityId === currentCommunityId) {
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
        closeMenu();
        router.refresh();
      });
    },
    [closeMenu, currentCommunityId, router, toast]
  );

  const handleStripeDashboard = useCallback(() => {
    startStripeTransition(async () => {
      await createExpressDashboardLoginLinkAction();
    });
  }, [createExpressDashboardLoginLinkAction]);

  const handleLogout = useCallback(() => {
    resetLogoutError();

    startLogoutTransition(async () => {
      try {
        const result = await logoutAction();

        if (!result.success) {
          setLogoutError(result.error.userMessage || LOGOUT_ERROR_MESSAGE);
          return;
        }

        closeMenu();
        window.location.href = result.redirectUrl || "/login";
      } catch {
        setLogoutError(LOGOUT_ERROR_MESSAGE);
      }
    });
  }, [closeMenu, logoutAction, resetLogoutError]);

  return {
    handleCommunitySwitch,
    handleStripeDashboard,
    handleLogout,
    pendingCommunityId,
    isCommunityPending,
    isStripePending,
    isLogoutPending,
    logoutError,
    resetLogoutError,
  };
}
