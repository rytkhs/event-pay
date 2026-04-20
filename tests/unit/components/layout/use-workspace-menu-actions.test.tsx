/** @jest-environment jsdom */

import { useRouter } from "next/navigation";
import { toast as sonnerToast } from "sonner";

import { act, renderHook, waitFor } from "@testing-library/react";

import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";
import { useWorkspaceMenuActions } from "@/components/layout/use-workspace-menu-actions";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: Object.assign(jest.fn(), {
    error: jest.fn(),
  }),
}));

const mockToast = sonnerToast as jest.Mock & { error: jest.Mock };
const mockToastError = mockToast.error;

jest.mock("@/app/(app)/actions/current-community", () => ({
  updateCurrentCommunityAction: jest.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

describe("useWorkspaceMenuActions", () => {
  const mockRouter = { refresh: jest.fn() };
  const logoutAction = jest.fn();
  const createExpressDashboardLoginLinkAction = jest.fn();
  const onMenuClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
  });

  function renderSubject() {
    return renderHook(() =>
      useWorkspaceMenuActions({
        currentCommunityId: "comm-1",
        logoutAction,
        createExpressDashboardLoginLinkAction,
        onMenuClose,
      })
    );
  }

  test("switches community, closes menu, and refreshes on success", async () => {
    const deferred = createDeferred<{
      success: true;
      data: { currentCommunityId: string };
    }>();
    (updateCurrentCommunityAction as jest.Mock).mockReturnValue(deferred.promise);

    const { result } = renderSubject();

    act(() => {
      result.current.handleCommunitySwitch("comm-2");
    });

    expect(result.current.pendingCommunityId).toBe("comm-2");
    expect(onMenuClose).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(updateCurrentCommunityAction).toHaveBeenCalledWith("comm-2");
    });

    await act(async () => {
      deferred.resolve({
        success: true,
        data: { currentCommunityId: "comm-2" },
      });
      await deferred.promise;
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("コミュニティを切り替えました");
      expect(mockRouter.refresh).toHaveBeenCalledTimes(1);
      expect(onMenuClose).toHaveBeenCalledTimes(1);
      expect(result.current.pendingCommunityId).toBeNull();
    });
  });

  test("shows destructive toast and keeps menu open on switch failure", async () => {
    (updateCurrentCommunityAction as jest.Mock).mockResolvedValue({
      success: false,
      error: { userMessage: "切り替えに失敗しました" },
      code: "INTERNAL_ERROR",
    });

    const { result } = renderSubject();

    act(() => {
      result.current.handleCommunitySwitch("comm-2");
    });

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "通信に失敗しました",
        expect.objectContaining({
          description: "切り替えに失敗しました",
        })
      );
    });

    expect(onMenuClose).not.toHaveBeenCalled();
    expect(mockRouter.refresh).not.toHaveBeenCalled();
    expect(result.current.pendingCommunityId).toBeNull();
  });

  test("shows loading state and calls action for Stripe dashboard", async () => {
    const deferred = createDeferred<void>();
    createExpressDashboardLoginLinkAction.mockReturnValue(deferred.promise);

    const { result } = renderSubject();

    act(() => {
      result.current.handleStripeDashboard();
    });

    expect(result.current.isStripePending).toBe(true);
    expect(onMenuClose).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(createExpressDashboardLoginLinkAction).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    await waitFor(() => {
      expect(result.current.isStripePending).toBe(false);
    });
  });

  test("stores and clears logout error on failure", async () => {
    logoutAction.mockResolvedValue({
      success: false,
      error: { userMessage: "ログアウト失敗" },
      code: "INTERNAL_ERROR",
    });

    const { result } = renderSubject();

    act(() => {
      result.current.handleLogout();
    });

    await waitFor(() => {
      expect(result.current.logoutError).toBe("ログアウト失敗");
    });

    act(() => {
      result.current.resetLogoutError();
    });

    expect(result.current.logoutError).toBeNull();
  });
});
