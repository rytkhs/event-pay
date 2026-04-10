/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const resolveAppWorkspaceForServerComponent = jest.fn();
const createCommunityAction = jest.fn();
const logoutAction = jest.fn();
const createCommunityForm = jest.fn(({ hasOwnedCommunities }: any) => (
  <div data-testid="create-community-form">
    {hasOwnedCommunities ? "コミュニティを追加" : "最初のコミュニティを作成してください。"}
  </div>
));

jest.mock("@core/community/app-workspace", () => ({
  resolveAppWorkspaceForServerComponent,
}));

jest.mock("@features/communities/components/CreateCommunityForm", () => ({
  CreateCommunityForm: (props: any) => createCommunityForm(props),
}));

jest.mock("@/app/(app)/actions/communities", () => ({
  createCommunityAction,
}));

jest.mock("@/app/(auth)/actions", () => ({
  logoutAction,
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

jest.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild: _asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("CreateCommunityPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("community 未作成でも create form を表示する", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      currentCommunity: null,
      hasOwnedCommunities: false,
    });

    const CreateCommunityPage = (await import("../../../../app/(focus)/communities/create/page"))
      .default;
    const ui = await CreateCommunityPage();

    render(ui);

    expect(screen.getByText("最初のコミュニティを作成してください。")).toBeInTheDocument();
    expect(screen.getByTestId("create-community-form")).toBeInTheDocument();
    expect(createCommunityForm).toHaveBeenCalledWith(
      expect.objectContaining({
        createCommunityAction,
        logoutAction,
        hasOwnedCommunities: false,
      })
    );
  });

  it("既存 owner には追加作成向けコピーを表示する", async () => {
    resolveAppWorkspaceForServerComponent.mockResolvedValue({
      currentCommunity: {
        id: "community-1",
        name: "ボドゲ会",
      },
      hasOwnedCommunities: true,
    });

    const CreateCommunityPage = (await import("../../../../app/(focus)/communities/create/page"))
      .default;
    const ui = await CreateCommunityPage();

    render(ui);

    expect(screen.getByText("コミュニティを追加")).toBeInTheDocument();
    expect(createCommunityForm).toHaveBeenCalledWith(
      expect.objectContaining({
        logoutAction,
        hasOwnedCommunities: true,
      })
    );
  });
});
