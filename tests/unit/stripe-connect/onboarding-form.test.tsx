/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

describe("OnboardingForm", () => {
  const onStartOnboarding = jest.fn(async () => ({
    success: true as const,
    data: {},
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    global.ResizeObserver = ResizeObserverMock;
  });

  it("secondaryAction が渡された場合だけ表示する", async () => {
    const { OnboardingForm } = await import("@/features/stripe-connect/components/OnboardingForm");

    render(
      <OnboardingForm
        communities={[
          {
            description: "ボードゲームを楽しむコミュニティです。",
            id: "community-1",
            name: "ボドゲ会",
            publicPageUrl: "http://localhost:3000/c/board-games",
            slug: "board-games",
          },
        ]}
        defaultRepresentativeCommunityId="community-1"
        onStartOnboarding={onStartOnboarding}
        secondaryAction={<a href="/dashboard">あとで設定する</a>}
      />
    );

    expect(screen.getByRole("link", { name: "あとで設定する" })).toHaveAttribute(
      "href",
      "/dashboard"
    );
  });

  it("secondaryAction が未指定なら後回し導線を表示しない", async () => {
    const { OnboardingForm } = await import("@/features/stripe-connect/components/OnboardingForm");

    render(
      <OnboardingForm
        communities={[
          {
            description: "ボードゲームを楽しむコミュニティです。",
            id: "community-1",
            name: "ボドゲ会",
            publicPageUrl: "http://localhost:3000/c/board-games",
            slug: "board-games",
          },
        ]}
        defaultRepresentativeCommunityId="community-1"
        onStartOnboarding={onStartOnboarding}
      />
    );

    expect(screen.queryByText("あとで設定する")).not.toBeInTheDocument();
  });

  it("単一コミュニティの説明が空でもオンボーディングを開始する", async () => {
    const user = userEvent.setup();
    const { OnboardingForm } = await import("@/features/stripe-connect/components/OnboardingForm");

    render(
      <OnboardingForm
        communities={[
          {
            description: null,
            id: "community-1",
            name: "ボドゲ会",
            publicPageUrl: "http://localhost:3000/c/board-games",
            slug: "board-games",
          },
        ]}
        defaultRepresentativeCommunityId="community-1"
        onStartOnboarding={onStartOnboarding}
      />
    );

    await user.click(screen.getByRole("button", { name: "オンライン集金を有効にする" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(onStartOnboarding).toHaveBeenCalledTimes(1));
  });

  it("複数コミュニティで説明が空のコミュニティを選んでもオンボーディングを開始する", async () => {
    const user = userEvent.setup();
    const { OnboardingForm } = await import("@/features/stripe-connect/components/OnboardingForm");

    render(
      <OnboardingForm
        communities={[
          {
            description: "既に説明があります。",
            id: "community-1",
            name: "ボドゲ会",
            publicPageUrl: "http://localhost:3000/c/board-games",
            slug: "board-games",
          },
          {
            description: "",
            id: "community-2",
            name: "読書会",
            publicPageUrl: "http://localhost:3000/c/books",
            slug: "books",
          },
        ]}
        defaultRepresentativeCommunityId="community-1"
        onStartOnboarding={onStartOnboarding}
      />
    );

    await user.click(screen.getByLabelText("読書会"));
    await user.click(screen.getByRole("button", { name: "オンライン集金を有効にする" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(onStartOnboarding).toHaveBeenCalledTimes(1));
  });
});
