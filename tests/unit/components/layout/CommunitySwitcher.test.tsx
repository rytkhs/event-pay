/** @jest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useRouter } from "next/navigation";

import { CommunitySwitcher } from "@/components/layout/CommunitySwitcher";
import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";
import { useToast } from "@core/contexts/toast-context";
import { SidebarProvider } from "@/components/ui/sidebar";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img alt={alt} {...props} />
  ),
}));

jest.mock("@/app/(app)/actions/current-community", () => ({
  updateCurrentCommunityAction: jest.fn(),
}));

jest.mock("@core/contexts/toast-context", () => ({
  useToast: jest.fn(),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuItem: ({
    children,
    asChild,
    onSelect,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    onSelect?: (event: { preventDefault: () => void }) => void;
    disabled?: boolean;
    className?: string;
  }) => {
    if (asChild) {
      return <div className={className}>{children}</div>;
    }

    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() =>
          onSelect?.({
            preventDefault: jest.fn(),
          })
        }
      >
        {children}
      </button>
    );
  },
}));

describe("CommunitySwitcher", () => {
  const mockRouter = { refresh: jest.fn() };
  const mockToast = jest.fn();
  const logoutAction = jest.fn();
  const createExpressDashboardLoginLinkAction = jest.fn();

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

  const renderWithProvider = () =>
    render(
      <SidebarProvider>
        <CommunitySwitcher
          workspace={baseWorkspace}
          logoutAction={logoutAction}
          createExpressDashboardLoginLinkAction={createExpressDashboardLoginLinkAction}
        />
      </SidebarProvider>
    );

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue(mockRouter);
    (useToast as jest.Mock).mockReturnValue({ toast: mockToast });
  });

  test("renders current community name in workspace trigger", () => {
    renderWithProvider();

    const button = screen.getAllByRole("button")[0];
    expect(button).toHaveTextContent(/Community 1/i);
    expect(button).toHaveTextContent(/コミュニティ/i);
  });

  test("shows workspace menu items", async () => {
    renderWithProvider();

    expect(await screen.findByText("コミュニティを切り替える")).toBeInTheDocument();
    expect(screen.getByText("Stripeダッシュボード")).toBeInTheDocument();
    expect(screen.getByText("設定")).toBeInTheDocument();
    expect(screen.getByText("ログアウト")).toBeInTheDocument();
  });

  test("switches community and shows toast on success", async () => {
    (updateCurrentCommunityAction as jest.Mock).mockResolvedValue({
      success: true,
      data: { currentCommunityId: "comm-2" },
    });

    renderWithProvider();

    fireEvent.click(screen.getByText("Community 2"));

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

    renderWithProvider();

    fireEvent.click(screen.getByText("Community 2"));

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
