/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

class ResizeObserverMock {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}

describe("OnboardingForm", () => {
  const communityDescriptionTemplate =
    "本コミュニティでは、サークル・グループの活動やイベント等の企画・運営を行っています。イベント管理プラットフォーム「みんなの集金」を利用して、イベント開催時の参加費や会費の支払い受付を行っています。詳細な内容や料金、支払方法は各イベントの案内で確認できます。";
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

  it("単一コミュニティの説明が空ならオンボーディング開始前に入力モーダルを表示する", async () => {
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

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "コミュニティ説明" })).toBeInTheDocument();
    expect(onStartOnboarding).not.toHaveBeenCalled();
  });

  it("定型文を挿入できる", async () => {
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
    await user.click(screen.getByRole("button", { name: "定型文を挿入" }));

    expect(screen.getByRole("textbox", { name: "コミュニティ説明" })).toHaveValue(
      communityDescriptionTemplate
    );
  });

  it("複数コミュニティでは選択中コミュニティの説明有無でモーダル表示を判定する", async () => {
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

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(onStartOnboarding).not.toHaveBeenCalled();
  });

  it("Server Action の communityDescription field error をモーダル内に表示する", async () => {
    const user = userEvent.setup();
    const failingAction = jest.fn(async () => ({
      success: false as const,
      error: {
        code: "VALIDATION_ERROR" as const,
        correlationId: "sa_test",
        retryable: false,
        userMessage: "コミュニティ説明を入力してください",
        fieldErrors: {
          communityDescription: ["コミュニティ説明を入力してください"],
        },
      },
    }));
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
        ]}
        defaultRepresentativeCommunityId="community-1"
        onStartOnboarding={failingAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "オンライン集金を有効にする" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("alert").at(-1)).toHaveTextContent(
      "コミュニティ説明を入力してください"
    );
  });
});
