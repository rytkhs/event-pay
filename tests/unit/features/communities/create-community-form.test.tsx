/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";

const mockPush = jest.fn();

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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("name と description を表示する", async () => {
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
        hasOwnedCommunities={false}
      />
    );

    expect(screen.getByLabelText("コミュニティ名")).toBeInTheDocument();
    expect(screen.getByLabelText("説明文")).toBeInTheDocument();
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
      <CreateCommunityForm createCommunityAction={createCommunityAction} hasOwnedCommunities />
    );

    await user.type(screen.getByLabelText("コミュニティ名"), "読書会");
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
        hasOwnedCommunities={false}
      />
    );

    await user.type(screen.getByLabelText("コミュニティ名"), "映画会");
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
        hasOwnedCommunities={false}
      />
    );

    await user.type(screen.getByLabelText("コミュニティ名"), "散歩会");
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
