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

describe("CommunityProfileVisibilityForm", () => {
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

  it("プロフィールリンク表示トグルの値を送信する", async () => {
    const user = userEvent.setup();
    const updateCommunityProfileVisibilityAction = jest.fn(async (_state, formData: FormData) => {
      expect(formData.get("showCommunityLink")).toBe("true");
      expect(formData.get("name")).toBeNull();
      expect(formData.get("description")).toBeNull();

      return {
        success: true as const,
        data: {
          communityId: "community-1",
          showCommunityLink: true,
        },
        message: "コミュニティプロフィールの表示設定を更新しました",
      };
    });

    const { CommunityProfileVisibilityForm } =
      await import("@/features/communities/components/CommunityProfileVisibilityForm");

    render(
      <CommunityProfileVisibilityForm
        defaultShowCommunityLink={false}
        updateCommunityProfileVisibilityAction={updateCommunityProfileVisibilityAction}
      />
    );

    await user.click(
      screen.getByRole("switch", {
        name: "参加者向けページにコミュニティプロフィールへのリンクを表示",
      })
    );
    await user.click(screen.getByRole("button", { name: "表示設定を保存" }));

    expect(await screen.findByText("更新しました")).toBeInTheDocument();
    expect(screen.getByText("主催者へのお問い合わせについて").parentElement).toHaveTextContent(
      "プラットフォーム内に受信箱・チャット・返信管理機能はありません。"
    );
  });
});
