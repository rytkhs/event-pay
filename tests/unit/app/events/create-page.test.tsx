/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const createServerComponentSupabaseClient = jest.fn();
const getDashboardConnectCtaStatus = jest.fn();
const resolveEventStripePayoutProfile = jest.fn();
const getFeeConfig = jest.fn();

const platformFeeConfig = {
  rate: 0.08,
  fixedFee: 30,
  minimumFee: 0,
  maximumFee: 0,
  taxRate: 0,
  isTaxIncluded: true,
};

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerComponentSupabaseClient,
}));

jest.mock("@core/stripe/fee-config/service", () => ({
  FeeConfigService: jest.fn().mockImplementation(() => ({
    getConfig: getFeeConfig,
  })),
}));

jest.mock("@features/events", () => ({
  SinglePageEventForm: ({
    canUseOnlinePayments,
    connectStatus,
    currentCommunityName,
    feeEstimateConfig,
  }: {
    canUseOnlinePayments: boolean;
    connectStatus: { statusType?: string } | string | undefined;
    currentCommunityName: string;
    feeEstimateConfig?: { rate: number } | null;
  }) => {
    const connectStatusLabel =
      typeof connectStatus === "string" ? connectStatus : (connectStatus?.statusType ?? "none");
    const feeEstimateConfigLabel = feeEstimateConfig ? String(feeEstimateConfig.rate) : "null";

    return (
      <div>{`form:${String(canUseOnlinePayments)}:${connectStatusLabel}:${currentCommunityName}:${feeEstimateConfigLabel}`}</div>
    );
  },
}));

jest.mock("@features/events/server", () => ({
  resolveEventStripePayoutProfile,
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
    getFeeConfig.mockResolvedValue({ platform: platformFeeConfig });
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
    resolveEventStripePayoutProfile.mockResolvedValue({
      isReady: true,
      payoutProfileId: "profile-1",
      shouldBackfillEventSnapshot: true,
    });

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;
    const ui = await CreateEventPage();

    render(ui);

    expect(createServerComponentSupabaseClient).toHaveBeenCalledTimes(1);
    expect(getDashboardConnectCtaStatus).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "community-1"
    );
    expect(resolveEventStripePayoutProfile).toHaveBeenCalledWith(expect.anything(), {
      currentCommunityId: "community-1",
      eventPayoutProfileId: null,
    });
    expect(screen.getByText("form:true:none:ボドゲ会:0.08")).toBeInTheDocument();
    expect(getFeeConfig).toHaveBeenCalledTimes(1);
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
    getDashboardConnectCtaStatus.mockResolvedValue({ statusType: "no_account" });
    resolveEventStripePayoutProfile.mockResolvedValue({
      isReady: false,
      payoutProfileId: null,
      shouldBackfillEventSnapshot: false,
    });

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;
    const ui = await CreateEventPage();

    render(ui);

    expect(screen.getByText("form:false:no_account:ボドゲ会:0.08")).toBeInTheDocument();
  });

  it("payouts disabled の警告CTAがあっても collection_ready ならオンライン決済を許可する", async () => {
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
    getDashboardConnectCtaStatus.mockResolvedValue({
      statusType: "ready",
      actionUrl: "/settings/payments",
    });
    resolveEventStripePayoutProfile.mockResolvedValue({
      isReady: true,
      payoutProfileId: "profile-1",
      shouldBackfillEventSnapshot: true,
    });

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;
    const ui = await CreateEventPage();

    render(ui);

    expect(screen.getByText("form:true:ready:ボドゲ会:0.08")).toBeInTheDocument();
  });

  it("fee_config 取得に失敗してもフォームを表示し feeEstimateConfig は null にする", async () => {
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
    getDashboardConnectCtaStatus.mockResolvedValue({ statusType: "ready" });
    resolveEventStripePayoutProfile.mockResolvedValue({
      isReady: true,
      payoutProfileId: "profile-1",
      shouldBackfillEventSnapshot: true,
    });
    getFeeConfig.mockRejectedValue(new Error("fee_config unavailable"));

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;
    const ui = await CreateEventPage();

    render(ui);

    expect(screen.getByText("form:true:ready:ボドゲ会:null")).toBeInTheDocument();
  });
});
