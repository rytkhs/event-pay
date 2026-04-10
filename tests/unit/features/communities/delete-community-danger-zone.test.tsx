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

describe("DeleteCommunityDangerZone", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("danger zone を表示する", async () => {
    const deleteCommunityAction = jest.fn(async () => ({
      success: true as const,
      data: {
        deletedCommunityId: "community-1",
        nextCurrentCommunityId: null,
      },
      redirectUrl: "/dashboard",
    }));

    const { DeleteCommunityDangerZone } =
      await import("@/features/communities/components/DeleteCommunityDangerZone");

    render(
      <DeleteCommunityDangerZone
        communityName="ボドゲ会"
        deleteCommunityAction={deleteCommunityAction}
      />
    );

    expect(screen.getByText("「ボドゲ会」を削除")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "削除する" })).toBeInTheDocument();
  });

  it("domain error を alert 表示する", async () => {
    const user = userEvent.setup();
    const deleteCommunityAction = jest.fn(async () => ({
      success: false as const,
      error: {
        code: "RESOURCE_CONFLICT" as const,
        correlationId: "sa_123",
        retryable: false,
        userMessage:
          "代表コミュニティに設定されているため削除できません。付け替え後に削除してください",
      },
    }));

    const { DeleteCommunityDangerZone } =
      await import("@/features/communities/components/DeleteCommunityDangerZone");

    render(
      <DeleteCommunityDangerZone
        communityName="ボドゲ会"
        deleteCommunityAction={deleteCommunityAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "削除する" }));
    await user.click(screen.getByRole("button", { name: "コミュニティを削除" }));

    expect(await screen.findByText("削除できませんでした")).toBeInTheDocument();
    expect(
      screen.getByText(
        "代表コミュニティに設定されているため削除できません。付け替え後に削除してください"
      )
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("成功時は redirectUrl へ遷移する", async () => {
    const user = userEvent.setup();
    const deleteCommunityAction = jest.fn(async () => ({
      success: true as const,
      data: {
        deletedCommunityId: "community-1",
        nextCurrentCommunityId: "community-2",
      },
      message: "コミュニティを削除しました",
      redirectUrl: "/dashboard",
    }));

    const { DeleteCommunityDangerZone } =
      await import("@/features/communities/components/DeleteCommunityDangerZone");

    render(
      <DeleteCommunityDangerZone
        communityName="ボドゲ会"
        deleteCommunityAction={deleteCommunityAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "削除する" }));
    await user.click(screen.getByRole("button", { name: "コミュニティを削除" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("submit 中は destructive button を disable する", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{
      success: true;
      data: {
        deletedCommunityId: string;
        nextCurrentCommunityId: string | null;
      };
      redirectUrl: string;
    }>();
    const deleteCommunityAction = jest.fn(() => deferred.promise);

    const { DeleteCommunityDangerZone } =
      await import("@/features/communities/components/DeleteCommunityDangerZone");

    render(
      <DeleteCommunityDangerZone
        communityName="ボドゲ会"
        deleteCommunityAction={deleteCommunityAction}
      />
    );

    await user.click(screen.getByRole("button", { name: "削除する" }));
    await user.click(screen.getByRole("button", { name: "コミュニティを削除" }));

    expect(await screen.findByRole("button", { name: /削除中/ })).toBeDisabled();

    deferred.resolve({
      success: true,
      data: {
        deletedCommunityId: "community-1",
        nextCurrentCommunityId: null,
      },
      redirectUrl: "/dashboard",
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard");
    });
  });
});
