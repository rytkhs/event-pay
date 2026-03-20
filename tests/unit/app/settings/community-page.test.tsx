/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const requireNonEmptyCommunityWorkspaceForServerComponent = jest.fn();
const createServerComponentSupabaseClient = jest.fn();
const getCurrentCommunitySettings = jest.fn();
const updateCommunityAction = jest.fn();
const redirect = jest.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});

jest.mock("@core/community/app-workspace", () => ({
  requireNonEmptyCommunityWorkspaceForServerComponent,
}));

jest.mock("@core/supabase/factory", () => ({
  createServerComponentSupabaseClient,
}));

jest.mock("@features/communities/server", () => ({
  getCurrentCommunitySettings,
}));

jest.mock("@/app/(app)/actions/communities", () => ({
  updateCommunityAction,
}));

jest.mock("next/navigation", () => ({
  redirect,
}));

jest.mock("@features/communities", () => ({
  CurrentCommunitySettingsOverview: ({
    settings,
    updateCommunityAction: mockedUpdateCommunityAction,
  }: {
    settings: { community: { name: string } };
    updateCommunityAction: unknown;
  }) => (
    <div>
      settings:{settings.community.name}
      {mockedUpdateCommunityAction ? ":action" : ""}
    </div>
  ),
}));

describe("CommunitySettingsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("community 空状態なら /dashboard redirect を優先し read model を読まない", async () => {
    requireNonEmptyCommunityWorkspaceForServerComponent.mockRejectedValue(
      new Error("NEXT_REDIRECT:/dashboard")
    );

    const CommunitySettingsPage = (await import("../../../../app/(app)/settings/community/page"))
      .default;

    await expect(CommunitySettingsPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(createServerComponentSupabaseClient).not.toHaveBeenCalled();
    expect(getCurrentCommunitySettings).not.toHaveBeenCalled();
  });

  it("current community の設定 read model を表示する", async () => {
    createServerComponentSupabaseClient.mockResolvedValue({ from: jest.fn() });
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      currentUser: {
        id: "user-1",
      },
      currentCommunity: {
        id: "community-1",
      },
    });
    getCurrentCommunitySettings.mockResolvedValue({
      community: {
        name: "ボドゲ会",
      },
    });

    const CommunitySettingsPage = (await import("../../../../app/(app)/settings/community/page"))
      .default;
    const ui = await CommunitySettingsPage();

    render(ui);

    expect(getCurrentCommunitySettings).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "community-1"
    );
    expect(screen.getByText("settings:ボドゲ会:action")).toBeInTheDocument();
  });

  it("read model が解決できない場合は /dashboard に fail-close する", async () => {
    createServerComponentSupabaseClient.mockResolvedValue({ from: jest.fn() });
    requireNonEmptyCommunityWorkspaceForServerComponent.mockResolvedValue({
      currentUser: {
        id: "user-1",
      },
      currentCommunity: {
        id: "community-1",
      },
    });
    getCurrentCommunitySettings.mockResolvedValue(null);

    const CommunitySettingsPage = (await import("../../../../app/(app)/settings/community/page"))
      .default;

    await expect(CommunitySettingsPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
