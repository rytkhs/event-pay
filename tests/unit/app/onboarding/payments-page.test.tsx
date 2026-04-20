/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const resolveAppWorkspaceForServerComponent = jest.fn();
const createUserStripeConnectServiceForServerComponent = jest.fn();
const getConnectAccountForCommunity = jest.fn();
const onboardingForm = jest.fn(({ secondaryAction }: any) => (
  <div data-testid="onboarding-form">{secondaryAction}</div>
));
const redirect = jest.fn();
const startOnboardingAction = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  resolveAppWorkspaceForServerComponent,
}));

jest.mock("@core/seo/metadata", () => ({
  getPublicUrl: (path: string) => `https://example.test${path}`,
}));

jest.mock("@features/stripe-connect", () => ({
  OnboardingForm: (props: any) => onboardingForm(props),
}));

jest.mock("@features/stripe-connect/server", () => ({
  createUserStripeConnectServiceForServerComponent,
}));

jest.mock("@/app/_actions/stripe-connect/actions", () => ({
  startOnboardingAction,
}));

jest.mock("next/navigation", () => ({
  redirect,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

describe("OnboardingPaymentsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    redirect.mockReset();
    createUserStripeConnectServiceForServerComponent.mockResolvedValue({
      getConnectAccountForCommunity,
    });
    getConnectAccountForCommunity.mockResolvedValue(null);
  });

  it("Connect account 未作成なら初回用コピーと OnboardingForm を表示する", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      currentUser: {
        id: "user-1",
      },
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
        slug: "board-games",
        createdAt: "2026-03-10T00:00:00.000Z",
      },
      ownedCommunities: [
        {
          id: "community-1",
          name: "ボドゲ会",
          slug: "board-games",
          createdAt: "2026-03-10T00:00:00.000Z",
        },
      ],
    });

    const OnboardingPaymentsPage = (
      await import("../../../../app/(focus)/onboarding/payments/page")
    ).default;
    const ui = await OnboardingPaymentsPage();

    render(ui);

    expect(screen.getByTestId("onboarding-form")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "今は設定せずにダッシュボードへ" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
    expect(getConnectAccountForCommunity).toHaveBeenCalledWith("user-1", "community-1");
    expect(onboardingForm).toHaveBeenCalledWith(
      expect.objectContaining({
        communities: [
          {
            description: null,
            id: "community-1",
            name: "ボドゲ会",
            slug: "board-games",
            publicPageUrl: "https://example.test/c/board-games",
          },
        ],
        defaultRepresentativeCommunityId: "community-1",
        hasExistingAccount: false,
        onStartOnboarding: startOnboardingAction,
      })
    );
  });

  it("community 未作成なら communities/create へ redirect する", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      currentUser: {
        id: "user-1",
      },
      currentCommunity: null,
      ownedCommunities: [],
    });
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const OnboardingPaymentsPage = (
      await import("../../../../app/(focus)/onboarding/payments/page")
    ).default;

    await expect(OnboardingPaymentsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/communities/create");
    expect(createUserStripeConnectServiceForServerComponent).not.toHaveBeenCalled();
  });

  it("代表コミュニティ設定済みの Connect account がある場合は settings/payments へ redirect する", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      currentUser: {
        id: "user-1",
      },
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
        slug: "board-games",
        createdAt: "2026-03-10T00:00:00.000Z",
      },
      ownedCommunities: [
        {
          id: "community-1",
          name: "ボドゲ会",
          slug: "board-games",
          createdAt: "2026-03-10T00:00:00.000Z",
        },
      ],
    });
    getConnectAccountForCommunity.mockResolvedValue({
      id: "profile-1",
      representative_community_id: "community-1",
      stripe_account_id: "acct_test",
    });
    redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const OnboardingPaymentsPage = (
      await import("../../../../app/(focus)/onboarding/payments/page")
    ).default;

    await expect(OnboardingPaymentsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/settings/payments");
  });
});
