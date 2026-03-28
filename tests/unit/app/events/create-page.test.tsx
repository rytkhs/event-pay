/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const createServerComponentSupabaseClient = jest.fn();
const getDashboardConnectCtaStatus = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerComponentSupabaseClient,
}));

jest.mock("@features/events", () => ({
  SinglePageEventForm: ({
    canUseOnlinePayments,
    connectStatus,
    currentCommunityName,
  }: {
    canUseOnlinePayments: boolean;
    connectStatus: string | undefined;
    currentCommunityName: string;
  }) => (
    <div>
      form:{String(canUseOnlinePayments)}:{connectStatus || "none"}:{currentCommunityName}
    </div>
  ),
}));

jest.mock("@features/stripe-connect/server", () => ({
  getDashboardConnectCtaStatus,
}));

jest.mock("../../../../app/(app)/events/create/actions", () => ({
  createEventAction: jest.fn(),
}));

describe("CreateEventPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("community 空状態なら /dashboard redirect を優先し Connect 状態を読まない", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockRejectedValue(
      new Error("NEXT_REDIRECT:/dashboard")
    );

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;

    await expect(CreateEventPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(createServerComponentSupabaseClient).not.toHaveBeenCalled();
    expect(getDashboardConnectCtaStatus).not.toHaveBeenCalled();
  });

  it("community がある場合は既存のイベント作成フォームを描画する", async () => {
    createServerComponentSupabaseClient.mockResolvedValue({ from: jest.fn() });
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      isCommunityEmptyState: false,
      currentUser: {
        id: "user-1",
      },
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
      },
    });
    getDashboardConnectCtaStatus.mockResolvedValue(undefined);

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;
    const ui = await CreateEventPage();

    render(ui);

    expect(createServerComponentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(getDashboardConnectCtaStatus).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "community-1"
    );
    expect(screen.getByText("form:true:none:ボドゲ会")).toBeInTheDocument();
  });

  it("current community の payout profile が未設定ならオンライン決済を fail-close にする", async () => {
    createServerComponentSupabaseClient.mockResolvedValue({ from: jest.fn() });
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      isCommunityEmptyState: false,
      currentUser: {
        id: "user-1",
      },
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
      },
    });
    getDashboardConnectCtaStatus.mockResolvedValue("no_account");

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;
    const ui = await CreateEventPage();

    render(ui);

    expect(screen.getByText("form:false:no_account:ボドゲ会")).toBeInTheDocument();
  });
});
