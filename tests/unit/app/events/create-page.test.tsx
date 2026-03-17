/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const getDetailedAccountStatusAction = jest.fn();

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
}));

jest.mock("@features/events", () => ({
  SinglePageEventForm: ({ canUseOnlinePayments }: { canUseOnlinePayments: boolean }) => (
    <div>form:{String(canUseOnlinePayments)}</div>
  ),
}));

jest.mock("@features/stripe-connect/server", () => ({
  getDetailedAccountStatusAction,
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
    expect(getDetailedAccountStatusAction).not.toHaveBeenCalled();
  });

  it("community がある場合は既存のイベント作成フォームを描画する", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      isCommunityEmptyState: false,
    });
    getDetailedAccountStatusAction.mockResolvedValue({
      success: true,
      data: { status: undefined },
    });

    const CreateEventPage = (await import("../../../../app/(app)/events/create/page")).default;
    const ui = await CreateEventPage();

    render(ui);

    expect(getDetailedAccountStatusAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("form:true")).toBeInTheDocument();
  });
});
