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

describe("UpdateCommunityBasicInfoForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("現在値を表示する", async () => {
    const updateCommunityBasicInfoAction = jest.fn(async () => ({
      success: true as const,
      data: {
        communityId: "community-1",
        name: "ボドゲ会",
        description: "毎週開催",
      },
      message: "コミュニティを更新しました",
    }));

    const { UpdateCommunityBasicInfoForm } =
      await import("@/features/communities/components/UpdateCommunityBasicInfoForm");

    render(
      <UpdateCommunityBasicInfoForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityBasicInfoAction={updateCommunityBasicInfoAction}
      />
    );

    expect(screen.getByDisplayValue("ボドゲ会")).toBeInTheDocument();
    expect(screen.getByDisplayValue("毎週開催")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変更を保存" })).toBeInTheDocument();
  });

  it("validation error を表示する", async () => {
    const user = userEvent.setup();
    const updateCommunityBasicInfoAction = jest.fn(async (_state, formData: FormData) => {
      expect(formData.get("name")).toBe("");
      expect(formData.get("slug")).toBe("malicious");
      expect(formData.get("showCommunityLink")).toBeNull();

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

    const { UpdateCommunityBasicInfoForm } =
      await import("@/features/communities/components/UpdateCommunityBasicInfoForm");

    render(
      <UpdateCommunityBasicInfoForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityBasicInfoAction={updateCommunityBasicInfoAction}
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
    const updateCommunityBasicInfoAction = jest.fn(() => deferred.promise);

    const { UpdateCommunityBasicInfoForm } =
      await import("@/features/communities/components/UpdateCommunityBasicInfoForm");

    render(
      <UpdateCommunityBasicInfoForm
        defaultDescription="毎週開催"
        defaultName="ボドゲ会"
        updateCommunityBasicInfoAction={updateCommunityBasicInfoAction}
      />
    );

    await user.type(screen.getByLabelText("コミュニティ名"), " (更新)");
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

describe("CommunityPublicPageVisibilityForm", () => {
  beforeAll(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("表示トグル2つの値を1回で送信する", async () => {
    const user = userEvent.setup();
    const updateCommunityPublicPageVisibilityAction = jest.fn(
      async (_state, formData: FormData) => {
        expect(formData.get("showCommunityLink")).toBe("true");
        expect(formData.get("showLegalDisclosureLink")).toBe("true");
        expect(formData.get("name")).toBeNull();
        expect(formData.get("description")).toBeNull();

        return {
          success: true as const,
          data: {
            communityId: "community-1",
            showCommunityLink: true,
            showLegalDisclosureLink: true,
          },
          message: "参加者向け表示設定を更新しました",
        };
      }
    );

    const { CommunityPublicPageVisibilityForm } =
      await import("@/features/communities/components/CommunityPublicPageVisibilityForm");

    render(
      <CommunityPublicPageVisibilityForm
        defaultShowCommunityLink={false}
        defaultShowLegalDisclosureLink={false}
        legalPageUrl="https://example.com/tokushoho/board-games"
        publicPageUrl="https://example.com/c/board-games"
        updateCommunityPublicPageVisibilityAction={updateCommunityPublicPageVisibilityAction}
      />
    );

    await user.click(
      screen.getByRole("switch", {
        name: "コミュニティプロフィールへのリンクを表示",
      })
    );
    await user.click(
      screen.getByRole("switch", {
        name: "特定商取引法に基づく表記へのリンクを表示",
      })
    );
    await user.click(screen.getByRole("button", { name: "変更を保存" }));

    expect(await screen.findByText("更新しました")).toBeInTheDocument();
  });

  it("変更がある場合だけ送信できる", async () => {
    const user = userEvent.setup();
    const updateCommunityPublicPageVisibilityAction = jest.fn(async () => ({
      success: true as const,
      data: {
        communityId: "community-1",
        showCommunityLink: false,
        showLegalDisclosureLink: true,
      },
      message: "参加者向け表示設定を更新しました",
    }));

    const { CommunityPublicPageVisibilityForm } =
      await import("@/features/communities/components/CommunityPublicPageVisibilityForm");

    render(
      <CommunityPublicPageVisibilityForm
        defaultShowCommunityLink={false}
        defaultShowLegalDisclosureLink={false}
        legalPageUrl="https://example.com/tokushoho/board-games"
        publicPageUrl="https://example.com/c/board-games"
        updateCommunityPublicPageVisibilityAction={updateCommunityPublicPageVisibilityAction}
      />
    );

    const submitButton = screen.getByRole("button", { name: "変更を保存" });

    expect(submitButton).toBeDisabled();

    await user.click(
      screen.getByRole("switch", {
        name: "特定商取引法に基づく表記へのリンクを表示",
      })
    );

    expect(submitButton).toBeEnabled();

    await user.click(submitButton);

    expect(await screen.findByText("更新しました")).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  it("URL文字列を本文に出さず確認ボタンのリンク先に使う", async () => {
    const updateCommunityPublicPageVisibilityAction = jest.fn(async () => ({
      success: true as const,
      data: {
        communityId: "community-1",
        showCommunityLink: false,
        showLegalDisclosureLink: false,
      },
      message: "参加者向け表示設定を更新しました",
    }));

    const { CommunityPublicPageVisibilityForm } =
      await import("@/features/communities/components/CommunityPublicPageVisibilityForm");

    render(
      <CommunityPublicPageVisibilityForm
        defaultShowCommunityLink={false}
        defaultShowLegalDisclosureLink={false}
        legalPageUrl="https://example.com/tokushoho/board-games"
        publicPageUrl="https://example.com/c/board-games"
        updateCommunityPublicPageVisibilityAction={updateCommunityPublicPageVisibilityAction}
      />
    );

    expect(screen.queryByText("https://example.com/c/board-games")).not.toBeInTheDocument();
    expect(screen.queryByText("https://example.com/tokushoho/board-games")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /コミュニティプロフィールを確認/ })).toHaveAttribute(
      "href",
      "https://example.com/c/board-games"
    );
    expect(screen.getByRole("link", { name: /特商法表記を確認/ })).toHaveAttribute(
      "href",
      "https://example.com/tokushoho/board-games"
    );
  });
});
