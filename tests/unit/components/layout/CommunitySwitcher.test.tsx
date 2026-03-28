/** @jest-environment jsdom */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";

import { CommunitySwitcher } from "@/components/layout/CommunitySwitcher";
import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";
import { useToast } from "@core/contexts/toast-context";
import { SidebarProvider } from "@/components/ui/sidebar";

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("@/app/(app)/actions/current-community", () => ({
  updateCurrentCommunityAction: jest.fn(),
}));

jest.mock("@core/contexts/toast-context", () => ({
  useToast: jest.fn(),
}));

describe("CommunitySwitcher", () => {
  const mockRouter = { refresh: jest.fn() };
  const mockToast = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
  });

  const baseWorkspace = {
    currentCommunity: {
      id: "comm-1",
      name: "Community 1",
      slug: "comm-1",
    },
    ownedCommunities: [
      { id: "comm-1", name: "Community 1", slug: "comm-1" },
      { id: "comm-2", name: "Community 2", slug: "comm-2" },
    ],
    hasOwnedCommunities: true,
    isCommunityEmptyState: false,
  };

  const renderWithProvider = (ui: React.ReactElement) => {
    return render(<SidebarProvider>{ui}</SidebarProvider>);
  };

  test("renders current community name", () => {
    renderWithProvider(<CommunitySwitcher workspace={baseWorkspace} />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent(/Community 1/i);
  });

  test("switches community and shows toast on success", async () => {
    (updateCurrentCommunityAction as jest.Mock).mockResolvedValue({
      success: true,
      data: { currentCommunityId: "comm-2" },
    });

    renderWithProvider(<CommunitySwitcher workspace={baseWorkspace} />);

    // Open dropdown
    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    // Select comm-2
    const comm2Item = screen.getByText("Community 2");
    fireEvent.click(comm2Item);

    await waitFor(() => {
      expect(updateCurrentCommunityAction).toHaveBeenCalledWith("comm-2");
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "コミュニティを切り替えました" })
    );
    expect(mockRouter.refresh).toHaveBeenCalled();
  });

  test("shows error toast on failure", async () => {
    (updateCurrentCommunityAction as jest.Mock).mockResolvedValue({
      success: false,
      error: { userMessage: "切り替えに失敗しました" },
      code: "INTERNAL_ERROR",
    });

    renderWithProvider(<CommunitySwitcher workspace={baseWorkspace} />);

    const trigger = screen.getByRole("button");
    fireEvent.click(trigger);

    const comm2Item = screen.getByText("Community 2");
    fireEvent.click(comm2Item);

    await waitFor(() => {
      expect(updateCurrentCommunityAction).toHaveBeenCalledWith("comm-2");
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "通信に失敗しました",
        description: "切り替えに失敗しました",
      })
    );
  });
});
