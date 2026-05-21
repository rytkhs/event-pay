/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPush = jest.fn();
const communityNamePlaceholder = "例: 〇〇サークル、〇〇会、〇〇のコミュニティ";

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

describe("CreateCommunityForm", () => {
  const logoutAction = jest.fn(async () => ({
    success: true as const,
    redirectUrl: "/login",
  }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("初回オンボーディング用の name フォームを表示する", async () => {
    const createCommunityAction = jest.fn(async () => ({
      success: true as const,
      data: { communityId: "community-1" },
      redirectUrl: "/dashboard",
    }));

    const { CreateCommunityForm } =
      await import("@/features/communities/components/CreateCommunityForm");

    render(
      <CreateCommunityForm
        createCommunityAction={createCommunityAction}
        logoutAction={logoutAction}
        hasOwnedCommunities={false}
      />
    );

    expect(screen.getByText("最初のコミュニティを作成")).toBeInTheDocument();
    expect(screen.getAllByText(/1 \/ 2/).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(communityNamePlaceholder)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /コミュニティを作成/ })).toBeInTheDocument();
  });

  it("validation error を表示する", async () => {
    const user = userEvent.setup();
    const createCommunityAction = jest.fn(async (_state, formData: FormData) => {
      expect(formData.get("name")).toBe("");

      return {
        success: false as const,
        error: {
          code: "VALIDATION_ERROR" as const,
          correlationId: "sa_123",
          retryable: false,
          userMessage: "入力内容を確認してください",
          fieldErrors: {
            name: ["コミュニティ名を入力してください"],
          },
        },
      };
    });

    const { CreateCommunityForm } =
      await import("@/features/communities/components/CreateCommunityForm");

    render(
      <CreateCommunityForm
        createCommunityAction={createCommunityAction}
        logoutAction={logoutAction}
        hasOwnedCommunities={false}
      />
    );

    await user.click(screen.getByRole("button", { name: /コミュニティを作成/ }));

    expect(await screen.findByText("コミュニティ名を入力してください")).toBeInTheDocument();
    expect(screen.getByText("入力内容を確認してください")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("domain error を alert 表示する", async () => {
    const user = userEvent.setup();
    const createCommunityAction = jest.fn(async () => ({
      success: false as const,
      error: {
        code: "DATABASE_ERROR" as const,
        correlationId: "sa_456",
        retryable: true,
        userMessage: "コミュニティの作成に失敗しました",
      },
    }));

    const { CreateCommunityForm } =
      await import("@/features/communities/components/CreateCommunityForm");

    render(
      <CreateCommunityForm
        createCommunityAction={createCommunityAction}
        logoutAction={logoutAction}
        hasOwnedCommunities
      />
    );

    await user.type(screen.getByPlaceholderText(communityNamePlaceholder), "読書会");
    await user.click(screen.getByRole("button", { name: /コミュニティを作成/ }));

    expect(await screen.findByText("作成できませんでした")).toBeInTheDocument();
    expect(screen.getByText("コミュニティの作成に失敗しました")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("成功時は redirectUrl へ遷移する", async () => {
    const user = userEvent.setup();
    const createCommunityAction = jest.fn(async () => ({
      success: true as const,
      data: {
        communityId: "community-2",
      },
      redirectUrl: "/dashboard",
      message: "コミュニティを作成しました",
    }));

    const { CreateCommunityForm } =
      await import("@/features/communities/components/CreateCommunityForm");

    render(
      <CreateCommunityForm
        createCommunityAction={createCommunityAction}
        logoutAction={logoutAction}
        hasOwnedCommunities={false}
      />
    );

    await user.type(screen.getByPlaceholderText(communityNamePlaceholder), "映画会");
    await user.click(screen.getByRole("button", { name: /コミュニティを作成/ }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("submit 中はボタンを disable して文言を切り替える", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{
      success: true;
      data: { communityId: string };
      redirectUrl: string;
    }>();
    const createCommunityAction = jest.fn(() => deferred.promise);

    const { CreateCommunityForm } =
      await import("@/features/communities/components/CreateCommunityForm");

    render(
      <CreateCommunityForm
        createCommunityAction={createCommunityAction}
        logoutAction={logoutAction}
        hasOwnedCommunities={false}
      />
    );

    await user.type(screen.getByPlaceholderText(communityNamePlaceholder), "散歩会");
    await user.click(screen.getByRole("button", { name: /コミュニティを作成/ }));

    expect(await screen.findByRole("button", { name: /作成中/ })).toBeDisabled();

    deferred.resolve({
      success: true,
      data: { communityId: "community-3" },
      redirectUrl: "/dashboard",
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});
