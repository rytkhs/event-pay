/** @jest-environment jsdom */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MarketingHeader } from "@/components/layout/GlobalHeader/MarketingHeader";
import { guideNavigation, marketingCTA } from "@/components/layout/GlobalHeader/navigation-config";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/"),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children: React.ReactNode; asChild?: boolean }) => (
    <>{children}</>
  ),
}));

describe("MarketingHeader", () => {
  test("renders marketing navigation and CTA links", () => {
    render(<MarketingHeader />);

    expect(screen.getByRole("link", { name: "みんなの集金" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "機能" })).toHaveAttribute("href", "/#features");
    expect(screen.getByRole("link", { name: "料金" })).toHaveAttribute("href", "/#pricing");
    expect(screen.getByRole("link", { name: "デモ" })).toHaveAttribute(
      "href",
      "https://demo.minnano-shukin.com/start-demo"
    );
    screen
      .getAllByRole("link", { name: "ログイン" })
      .forEach((link) => expect(link).toHaveAttribute("href", "/login"));
    screen
      .getAllByRole("link", { name: marketingCTA.label })
      .forEach((link) => expect(link).toHaveAttribute("href", marketingCTA.href));
  });

  test("renders guide menu links from guide navigation config", () => {
    render(<MarketingHeader />);

    expect(screen.getByRole("button", { name: "ガイド" })).toBeInTheDocument();

    guideNavigation.forEach((item) => {
      expect(screen.getByRole("link", { name: item.label })).toHaveAttribute("href", item.href);
    });
  });
});
