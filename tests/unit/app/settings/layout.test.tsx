/** @jest-environment jsdom */

import React from "react";

import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

const usePathname = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname,
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

describe("SettingsLayout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("settings ルートメニューにコミュニティ設定カードを表示する", async () => {
    usePathname.mockReturnValue("/settings");

    const { default: SettingsLayout } = await import("../../../../app/(app)/settings/layout");

    render(<SettingsLayout>child</SettingsLayout>);

    expect(screen.getByRole("link", { name: /コミュニティ/ })).toHaveAttribute(
      "href",
      "/settings/community"
    );
  });

  it("community settings ではページタイトルを表示する", async () => {
    usePathname.mockReturnValue("/settings/community");

    const { default: SettingsLayout } = await import("../../../../app/(app)/settings/layout");

    render(<SettingsLayout>child</SettingsLayout>);

    expect(screen.getByRole("heading", { name: "コミュニティ" })).toBeInTheDocument();
    expect(screen.getByText("選択中のコミュニティの設定")).toBeInTheDocument();
  });
});
