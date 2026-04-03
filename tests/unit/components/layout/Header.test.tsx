/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { usePathname, useSearchParams } from "next/navigation";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useSearchParams: jest.fn(),
}));

jest.mock("@/components/ui/separator", () => ({
  Separator: () => <span data-testid="separator" />,
}));

jest.mock("@/components/ui/sidebar", () => ({
  SidebarTrigger: () => <button type="button">toggle</button>,
}));

describe("Header", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (usePathname as jest.Mock).mockReturnValue("/settings/profile");
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
  });

  it("desktop header に現在ページタイトルを表示する", async () => {
    const { Header } = await import("@/components/layout/Header");

    render(<Header />);

    expect(screen.getByRole("heading", { level: 1, name: "アカウント" })).toBeInTheDocument();
  });

  it("sidebar toggle を表示する", async () => {
    const { Header } = await import("@/components/layout/Header");

    render(<Header />);

    expect(screen.getByRole("button", { name: "toggle" })).toBeInTheDocument();
  });
});
