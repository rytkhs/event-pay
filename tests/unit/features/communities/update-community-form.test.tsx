/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";

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

describe("UpdateCommunityForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("現在値を表示する", async () => {
    const updateCommunityAction = jest.fn(async () => ({
      success: true as const,
      data: {
        communityId: "community-1",
        name: "ボドゲ会",
        description: "毎週開催",
      },
      message: "コミュニティを更新しました",
    }));

    const { UpdateCommunityForm } =
      await import("@/features/communities/components/UpdateCommunityForm");

    render(
      <UpdateCommunityForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityAction={updateCommunityAction}
      />
    );

    expect(screen.getByDisplayValue("ボドゲ会")).toBeInTheDocument();
    expect(screen.getByDisplayValue("毎週開催")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変更を保存" })).toBeInTheDocument();
  });

  it("validation error を表示する", async () => {
    const user = userEvent.setup();
    const updateCommunityAction = jest.fn(async (_state, formData: FormData) => {
      expect(formData.get("name")).toBe("");
      expect(formData.get("slug")).toBe("malicious");

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

    const { UpdateCommunityForm } =
      await import("@/features/communities/components/UpdateCommunityForm");

    render(
      <UpdateCommunityForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityAction={updateCommunityAction}
      />
    );

    await user.clear(screen.getByLabelText("コミュニティ名"));
    const hidden = document.createElement("input");
    hidden.name = "slug";
    hidden.value = "malicious";
    screen.getByRole("button", { name: "変更を保存" }).closest("form")?.appendChild(hidden);
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("コミュニティ名を入力してください")).toBeInTheDocument();
    expect(screen.getByText("入力内容を確認してください")).toBeInTheDocument();
  });

  it("domain error を alert 表示する", async () => {
    const user = userEvent.setup();
    const updateCommunityAction = jest.fn(async () => ({
      success: false as const,
      error: {
        code: "DATABASE_ERROR" as const,
        correlationId: "sa_456",
        retryable: true,
        userMessage: "コミュニティの更新に失敗しました",
      },
    }));

    const { UpdateCommunityForm } =
      await import("@/features/communities/components/UpdateCommunityForm");

    render(
      <UpdateCommunityForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityAction={updateCommunityAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("更新できませんでした")).toBeInTheDocument();
    expect(screen.getByText("コミュニティの更新に失敗しました")).toBeInTheDocument();
  });

  it("成功時は成功メッセージを表示する", async () => {
    const user = userEvent.setup();
    const updateCommunityAction = jest.fn(async () => ({
      success: true as const,
      data: {
        communityId: "community-1",
        name: "新しい名前",
        description: "新しい説明",
      },
      message: "コミュニティを更新しました",
    }));

    const { UpdateCommunityForm } =
      await import("@/features/communities/components/UpdateCommunityForm");

    render(
      <UpdateCommunityForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityAction={updateCommunityAction}
      />
    );

    await user.type(screen.getByLabelText("コミュニティ名"), "!");
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("更新しました")).toBeInTheDocument();
    expect(screen.getByText("コミュニティを更新しました")).toBeInTheDocument();
  });

  it("submit 中はボタンを disable して文言を切り替える", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{
      success: true;
      data: {
        communityId: string;
        description: string | null;
        name: string;
      };
      message: string;
    }>();
    const updateCommunityAction = jest.fn(() => deferred.promise);

    const { UpdateCommunityForm } =
      await import("@/features/communities/components/UpdateCommunityForm");

    render(
      <UpdateCommunityForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityAction={updateCommunityAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByRole("button", { name: /更新中/ })).toBeDisabled();

    deferred.resolve({
      success: true,
      data: {
        communityId: "community-1",
        name: "ボドゲ会",
        description: "毎週開催",
      },
      message: "コミュニティを更新しました",
    });

    expect(await screen.findByText("更新しました")).toBeInTheDocument();
  });
});
